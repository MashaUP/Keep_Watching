/**
 * Keep_Watching — statistiche di visione locali (funzioni pure, nessun accesso a chrome.*).
 *
 * Le statistiche restano nel browser (chrome.storage.local, chiave "stats") e le scrive
 * solo il service worker, una modifica alla volta. Il player manda pezzi di tempo già
 * misurato ed eventi; questo modulo li somma.
 *
 * Definizioni (vedi anche docs/MANUTENZIONE.md, sezione Statistiche):
 *   - Tempo di visione: secondi in cui il video avanzava davvero (non in pausa, non in
 *     caricamento, non durante un salto), misurati dal player con l'orologio monotono.
 *   - Sessione: inizia alla prima riproduzione reale e continua finché passano meno di
 *     KW_SESSION_GAP_MS tra un pezzo di visione e il successivo, anche cambiando episodio.
 *     Viene contata nel giorno in cui inizia.
 *   - Episodio completato: il player ha raggiunto la fine (o l'inizio dei titoli) dopo aver
 *     guardato davvero almeno metà di quello che restava dal punto di partenza (minimo 60 s).
 *     Lo stesso episodio non viene contato due volte entro KW_COMPLETION_DEDUP_MS.
 *   - Intro e titoli saltati: solo i salti fatti dall'estensione, non quelli manuali.
 *   - Dato stimato: il giorno contiene un pezzo di tempo misurato con un intervallo lungo
 *     (scheda sospesa dal browser): il valore è plausibile ma non preciso al secondo.
 */
(function (root) {
  'use strict';

  const KW_STATS_SCHEMA = 1;
  const KW_SESSION_GAP_MS = 30 * 60 * 1000;
  const KW_STATS_MAX_DAYS = 400;
  const KW_SESSION_LOG_MAX = 300;
  const KW_COMPLETION_DEDUP_MS = 6 * 60 * 60 * 1000;
  const KW_MAX_CHUNK_S = 120;
  const EXPORT_SCHEMA = 'keep-watching-stats';
  const EXPORT_VERSION = 1;

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const pad = (n) => String(n).padStart(2, '0');

  /** Giorno locale "AAAA-MM-GG" di un istante (ms). */
  function dayKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** Mezzanotte locale del giorno successivo a un istante. */
  function nextMidnight(ms) {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  }

  /** Giorni locali da "da" a "a" compresi, in ordine. Gestisce i cambi di ora legale. */
  function dayRange(fromMs, toMs) {
    const out = [];
    const d = new Date(fromMs);
    let cur = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = dayKey(toMs);
    for (let i = 0; i < 4000; i++) {
      const k = dayKey(cur.getTime());
      out.push(k);
      if (k === end) break;
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    }
    return out;
  }

  /** Ultimi n giorni locali fino a "ora" compreso. */
  function lastDays(n, now = Date.now()) {
    const d = new Date(now);
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (n - 1)).getTime();
    return dayRange(from, now);
  }

  const emptyDay = () => ({ play: 0, sessions: 0, completed: 0, intro: 0, credits: 0, est: false });
  const emptyStats = () => ({ schema: KW_STATS_SCHEMA, days: {}, sessions: [], session: null, recent: [] });

  const num = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);

  /**
   * Controlla e ripara le statistiche lette dallo storage. Le voci rovinate vengono
   * scartate una per una; se l'oggetto è irriconoscibile si riparte da zero.
   */
  function validateStats(raw) {
    if (!raw || typeof raw !== 'object' || raw.schema !== KW_STATS_SCHEMA || typeof raw.days !== 'object' || !raw.days) {
      return { stats: emptyStats(), repaired: raw != null };
    }
    let repaired = false;
    const stats = emptyStats();
    for (const [k, d] of Object.entries(raw.days)) {
      if (!DATE_RE.test(k) || !d || typeof d !== 'object') { repaired = true; continue; }
      const day = emptyDay();
      for (const [f, max] of [['play', 86400], ['sessions', 5000], ['completed', 5000], ['intro', 5000], ['credits', 5000]]) {
        const v = num(d[f], max);
        if (v === null && d[f] !== undefined) repaired = true;
        day[f] = v || 0;
      }
      day.est = d.est === true;
      stats.days[k] = day;
    }
    if (Array.isArray(raw.sessions)) {
      for (const s of raw.sessions) {
        if (s && num(s.start, 1e14) !== null && num(s.play, 86400 * 3) !== null) stats.sessions.push({ start: s.start, play: s.play });
        else repaired = true;
      }
    }
    const s = raw.session;
    if (s && num(s.start, 1e14) !== null && num(s.last, 1e14) !== null && num(s.play, 86400 * 3) !== null) {
      stats.session = { start: s.start, last: s.last, play: s.play };
    } else if (s) repaired = true;
    if (Array.isArray(raw.recent)) {
      stats.recent = raw.recent.filter((r) => r && typeof r.k === 'string' && num(r.at, 1e14) !== null).slice(-50);
    }
    return { stats, repaired };
  }

  const dayOf = (stats, k) => (stats.days[k] = stats.days[k] || emptyDay());

  /** Chiude la sessione aperta se è passato troppo tempo dall'ultima visione. */
  function closeStaleSession(stats, now) {
    const s = stats.session;
    // Valore assoluto: se l'orologio di sistema torna indietro, è comunque un'altra sessione.
    if (s && Math.abs(now - s.last) > KW_SESSION_GAP_MS) {
      stats.sessions.push({ start: s.start, play: s.play });
      if (stats.sessions.length > KW_SESSION_LOG_MAX) stats.sessions.splice(0, stats.sessions.length - KW_SESSION_LOG_MAX);
      stats.session = null;
    }
  }

  /**
   * Aggiunge un pezzo di visione reale terminato all'istante "at" (ms), lungo "seconds".
   * Un pezzo a cavallo della mezzanotte viene diviso tra i due giorni.
   */
  function addPlay(stats, { seconds, at, estimated = false }) {
    let secs = Number(seconds);
    if (!Number.isFinite(secs) || secs <= 0) return stats;
    if (secs > KW_MAX_CHUNK_S) { secs = KW_MAX_CHUNK_S; estimated = true; }
    const end = Number.isFinite(at) ? at : Date.now();
    const start = end - secs * 1000;

    closeStaleSession(stats, start);
    if (!stats.session) {
      stats.session = { start, last: end, play: 0 };
      dayOf(stats, dayKey(start)).sessions += 1;
    }
    stats.session.last = Math.max(stats.session.last, end);
    stats.session.play += secs;

    let from = start;
    while (from < end) {
      const cut = Math.min(end, nextMidnight(from));
      const day = dayOf(stats, dayKey(from));
      day.play = Math.min(86400, day.play + (cut - from) / 1000);
      if (estimated) day.est = true;
      from = cut;
    }
    return stats;
  }

  /**
   * Eventi: 'intro' (intro saltata), 'introUndo' (salto annullato), 'credits' (titoli
   * saltati), 'completed' (episodio completato, con "key" per non contarlo due volte).
   * Restituisce false se l'evento è stato ignorato.
   */
  function addEvent(stats, { type, at, key }) {
    const when = Number.isFinite(at) ? at : Date.now();
    const day = dayOf(stats, dayKey(when));
    if (type === 'intro') day.intro += 1;
    else if (type === 'introUndo') { if (day.intro > 0) day.intro -= 1; else return false; }
    else if (type === 'credits') day.credits += 1;
    else if (type === 'completed') {
      if (key) {
        stats.recent = (stats.recent || []).filter((r) => when - r.at < KW_COMPLETION_DEDUP_MS);
        if (stats.recent.some((r) => r.k === key)) return false;
        stats.recent.push({ k: key, at: when });
      }
      day.completed += 1;
    } else return false;
    return true;
  }

  /** Tiene solo gli ultimi KW_STATS_MAX_DAYS giorni e chiude la sessione scaduta. */
  function prune(stats, now = Date.now()) {
    closeStaleSession(stats, now);
    const keep = new Set(lastDays(KW_STATS_MAX_DAYS, now));
    for (const k of Object.keys(stats.days)) if (!keep.has(k) && k < dayKey(now)) delete stats.days[k];
    const oldest = now - KW_STATS_MAX_DAYS * 86400 * 1000;
    stats.sessions = stats.sessions.filter((s) => s.start >= oldest);
    return stats;
  }

  /**
   * Riepilogo di un periodo: "today", 7 o 30 (giorni locali fino a oggi compreso).
   * avgSession usa le sessioni iniziate nel periodo, compresa quella in corso.
   */
  function summarize(stats, range, now = Date.now()) {
    const n = range === 'today' ? 1 : Number(range) || 7;
    const keys = lastDays(n, now);
    const set = new Set(keys);
    const days = keys.map((k) => ({ date: k, ...(stats.days[k] || emptyDay()) }));
    const sum = (f) => days.reduce((a, d) => a + d[f], 0);
    const all = [...stats.sessions];
    if (stats.session) all.push({ start: stats.session.start, play: stats.session.play });
    const inRange = all.filter((s) => set.has(dayKey(s.start)));
    const avgSession = inRange.length ? inRange.reduce((a, s) => a + s.play, 0) / inRange.length : 0;
    return {
      range, days,
      play: sum('play'),
      sessions: sum('sessions'),
      avgSession,
      completed: sum('completed'),
      intro: sum('intro'),
      credits: sum('credits'),
      estimated: days.some((d) => d.est),
      hasData: days.some((d) => d.play > 0 || d.sessions || d.completed || d.intro || d.credits)
    };
  }

  // ---------- Esportazione ----------

  /** Campo CSV con separatore ";": virgolette se contiene separatore, virgolette o a capo. */
  function csvField(value) {
    const s = value == null ? '' : String(value);
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  const CSV_COLUMNS = ['data', 'tempo_visione_secondi', 'tempo_visione', 'sessioni', 'episodi_completati',
    'intro_saltate', 'titoli_saltati', 'dato_stimato'];

  /** Giorni con dati, dal più vecchio al più recente. */
  function sortedDays(stats) {
    return Object.keys(stats.days).sort().map((k) => ({ date: k, ...stats.days[k] }))
      .filter((d) => d.play > 0 || d.sessions || d.completed || d.intro || d.credits);
  }

  /**
   * CSV per Excel e Fogli in italiano: separatore ";", BOM UTF-8, secondi interi
   * (così nessun problema con la virgola decimale). Restituisce solo l'intestazione se vuoto.
   */
  function toCSV(stats) {
    const rows = [CSV_COLUMNS.join(';')];
    for (const d of sortedDays(stats)) {
      const secs = Math.round(d.play);
      rows.push([d.date, secs, kwFmt(secs), d.sessions, d.completed, d.intro, d.credits, d.est ? 'sì' : 'no']
        .map(csvField).join(';'));
    }
    return '﻿' + rows.join('\r\n') + '\r\n';
  }

  function kwFmt(total) {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return `${h}:${pad(m)}:${pad(total % 60)}`;
  }

  /** JSON con schema e versione, senza titoli né indirizzi: solo numeri e date. */
  function toJSON(stats, now = Date.now(), version = '') {
    const days = sortedDays(stats).map((d) => ({
      date: d.date, play: Math.round(d.play), sessions: d.sessions, completed: d.completed,
      intro: d.intro, credits: d.credits, estimated: d.est
    }));
    const sessions = [...stats.sessions, ...(stats.session ? [{ start: stats.session.start, play: stats.session.play }] : [])]
      .map((s) => ({ start: new Date(s.start).toISOString(), play: Math.round(s.play) }));
    const totals = days.reduce((t, d) => {
      for (const f of ['play', 'sessions', 'completed', 'intro', 'credits']) t[f] += d[f];
      return t;
    }, { play: 0, sessions: 0, completed: 0, intro: 0, credits: 0 });
    return {
      schema: EXPORT_SCHEMA,
      version: EXPORT_VERSION,
      generatedAt: new Date(now).toISOString(),
      extensionVersion: version || undefined,
      period: days.length ? { from: days[0].date, to: days[days.length - 1].date } : null,
      units: { play: 'secondi di riproduzione reale', sessionGapMinutes: KW_SESSION_GAP_MS / 60000 },
      reliability: {
        play: 'misurato dal player (pause, caricamento e salti esclusi); "estimated" segna i giorni con intervalli lunghi',
        completed: 'fine o titoli raggiunti dopo aver guardato almeno metà di quanto restava',
        intro: 'solo salti fatti dall\'estensione', credits: 'solo salti fatti dall\'estensione'
      },
      totals,
      days,
      sessions
    };
  }

  // ---------- Importazione ----------

  /**
   * Controlla un file esportato. Rifiuta tutto il file se una voce è malformata o fuori
   * dai limiti: meglio nessun dato che dati sbagliati.
   */
  function parseImport(text) {
    let data;
    try { data = typeof text === 'string' ? JSON.parse(text.replace(/^﻿/, '')) : text; }
    catch (e) { return { ok: false, error: 'Il file non è un JSON valido.' }; }
    if (!data || typeof data !== 'object') return { ok: false, error: 'Il file è vuoto.' };
    if (data.schema !== EXPORT_SCHEMA) return { ok: false, error: 'Non è un file di statistiche di Keep Watching.' };
    if (!Number.isInteger(data.version) || data.version < 1) return { ok: false, error: 'Versione del file non valida.' };
    if (data.version > EXPORT_VERSION) return { ok: false, error: `Il file viene da una versione più recente (${data.version}): aggiorna Keep Watching.` };
    if (!Array.isArray(data.days)) return { ok: false, error: 'Mancano i dati giornalieri.' };
    if (data.days.length > 5000) return { ok: false, error: 'Troppi giorni nel file.' };

    const days = {};
    for (const [i, d] of data.days.entries()) {
      const where = `giorno ${i + 1}`;
      if (!d || typeof d !== 'object' || !DATE_RE.test(String(d.date)) || isNaN(Date.parse(d.date))) {
        return { ok: false, error: `Data non valida (${where}).` };
      }
      if (days[d.date]) return { ok: false, error: `Il giorno ${d.date} compare due volte.` };
      const day = emptyDay();
      for (const [f, max] of [['play', 86400], ['sessions', 5000], ['completed', 5000], ['intro', 5000], ['credits', 5000]]) {
        const v = d[f];
        if (v === undefined) continue;
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max || (f !== 'play' && !Number.isInteger(v))) {
          return { ok: false, error: `Valore non valido in "${f}" il ${d.date}.` };
        }
        day[f] = v;
      }
      if (d.estimated !== undefined && typeof d.estimated !== 'boolean') return { ok: false, error: `Valore non valido in "estimated" il ${d.date}.` };
      day.est = d.estimated === true;
      days[d.date] = day;
    }

    const sessions = [];
    if (data.sessions !== undefined) {
      if (!Array.isArray(data.sessions)) return { ok: false, error: 'Elenco delle sessioni non valido.' };
      for (const s of data.sessions.slice(-KW_SESSION_LOG_MAX)) {
        const start = s && Date.parse(s.start);
        if (!s || !Number.isFinite(start) || typeof s.play !== 'number' || s.play < 0 || s.play > 86400 * 3) {
          return { ok: false, error: 'Una sessione nel file non è valida.' };
        }
        sessions.push({ start, play: s.play });
      }
    }
    return { ok: true, days, sessions };
  }

  /**
   * Unisce dati importati. "merge": per ogni giorno e campo si tiene il valore più alto,
   * così reimportare lo stesso file non raddoppia nulla; le sessioni si deduplicano per
   * orario di inizio. "replace": lo storico viene sostituito (chiedere conferma prima).
   */
  function mergeImport(current, parsed, mode = 'merge') {
    const base = mode === 'replace' ? emptyStats() : validateStats(JSON.parse(JSON.stringify(current || emptyStats()))).stats;
    let added = 0;
    let updated = 0;
    for (const [k, d] of Object.entries(parsed.days)) {
      const had = base.days[k];
      if (!had) { base.days[k] = { ...d }; added++; continue; }
      let changed = false;
      for (const f of ['play', 'sessions', 'completed', 'intro', 'credits']) {
        if (d[f] > had[f]) { had[f] = d[f]; changed = true; }
      }
      if (d.est && !had.est) { had.est = true; changed = true; }
      if (changed) updated++;
    }
    const starts = new Set(base.sessions.map((s) => s.start));
    if (base.session) starts.add(base.session.start);
    for (const s of parsed.sessions) if (!starts.has(s.start)) { base.sessions.push(s); starts.add(s.start); }
    base.sessions.sort((a, b) => a.start - b.start);
    if (base.sessions.length > KW_SESSION_LOG_MAX) base.sessions.splice(0, base.sessions.length - KW_SESSION_LOG_MAX);
    return { stats: base, added, updated };
  }

  /** Chiave breve e non reversibile per riconoscere lo stesso episodio (FNV-1a 32 bit). */
  function episodeKey(text) {
    let h = 0x811c9dc5;
    for (const ch of String(text)) {
      h ^= ch.codePointAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  const api = {
    KW_STATS_SCHEMA, KW_SESSION_GAP_MS, KW_STATS_MAX_DAYS, KW_SESSION_LOG_MAX, KW_COMPLETION_DEDUP_MS, KW_MAX_CHUNK_S,
    EXPORT_SCHEMA, EXPORT_VERSION, CSV_COLUMNS,
    dayKey, dayRange, lastDays, emptyStats, validateStats, addPlay, addEvent, prune, summarize,
    csvField, toCSV, toJSON, parseImport, mergeImport, episodeKey
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KWStats = api;
})(typeof self !== 'undefined' ? self : globalThis);
