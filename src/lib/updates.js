/**
 * Keep_Watching — centro aggiornamenti (funzioni pure + un controllo con fetch iniettabile).
 *
 * Fonte ufficiale: il repository GitHub in KW_LINKS.repo (src/defaults.js), letto come file
 * semplici da raw.githubusercontent.com (claude/standard-comuni.md, sezione 3):
 *   1. version.json nella radice di main: versione, data, nome dello zip, SHA-256, novità;
 *   2. CHANGELOG.md di main, facoltativo, per il registro delle versioni.
 * Niente API di GitHub (limite di 60 richieste l'ora) e niente releases/latest.
 * Nessun dato locale viene inviato: niente cookie (credentials: 'omit'), niente parametri.
 * Il codice scaricato non viene mai eseguito: lo zip si apre in una scheda e lo estrae l'utente.
 */
(function (root) {
  'use strict';

  const RAW = 'https://raw.githubusercontent.com';
  const SHA_RE = /^[0-9a-f]{64}$/;
  const KW_UPDATE_COOLDOWN_MS = 60 * 1000;
  const KW_UPDATE_AUTO_MS = 24 * 60 * 60 * 1000;
  const ZIP_RE = /^Keep_Watching-(\d+\.\d+\.\d+)\.zip$/;

  // ---------- Versioni ----------

  /** "v1.4.0", "1.4.0-beta.2" → { major, minor, patch, pre: ['beta', 2] }; null se non valida. */
  function parseVersion(text) {
    const m = /^v?(\d{1,5})\.(\d{1,5})\.(\d{1,6})(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(text || '').trim());
    if (!m) return null;
    const pre = m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [];
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre, text: String(text).trim().replace(/^v/, '') };
  }

  /** Confronto semantico: 1.10.0 > 1.9.0 e 1.4.0 > 1.4.0-beta.1. null se non confrontabili. */
  function compareVersions(a, b) {
    const pa = typeof a === 'object' && a ? a : parseVersion(a);
    const pb = typeof b === 'object' && b ? b : parseVersion(b);
    if (!pa || !pb) return null;
    for (const k of ['major', 'minor', 'patch']) if (pa[k] !== pb[k]) return pa[k] > pb[k] ? 1 : -1;
    if (!pa.pre.length || !pb.pre.length) return pa.pre.length === pb.pre.length ? 0 : (pa.pre.length ? -1 : 1);
    for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
      const x = pa.pre[i];
      const y = pb.pre[i];
      if (x === undefined) return -1;
      if (y === undefined) return 1;
      if (x === y) continue;
      if (typeof x === 'number' && typeof y === 'number') return x > y ? 1 : -1;
      if (typeof x === 'number') return -1;
      if (typeof y === 'number') return 1;
      return x > y ? 1 : -1;
    }
    return 0;
  }

  // ---------- Testi ----------

  const clean = (s) => String(s).replace(/\*\*/g, '').replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();

  /** Voci "- …" di un testo markdown (note di release), al massimo 12. */
  function bulletsFrom(md, max = 12) {
    const out = [];
    for (const riga of String(md || '').split(/\r?\n/)) {
      const v = /^\s*[-*]\s+(.*)$/.exec(riga);
      if (v && clean(v[1])) out.push(clean(v[1]).slice(0, 240));
      if (out.length >= max) break;
    }
    return out;
  }

  /**
   * CHANGELOG.md nel formato del progetto:
   *   ## [1.3.0] - 2026-10-09   (anche "## 1.3.0 · titolo")
   *   ### Aggiunto
   *   - voce
   */
  function parseChangelog(md, max = 10) {
    const out = [];
    let cur = null;
    let section = '';
    for (const riga of String(md || '').split(/\r?\n/)) {
      const t = /^##\s+\[?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]?\s*(?:[-–—·]\s*)?(.*)$/.exec(riga);
      if (t) {
        const dateM = /(\d{4}-\d{2}-\d{2})/.exec(t[2]);
        cur = { version: t[1], date: dateM ? dateM[1] : null, items: [] };
        out.push(cur);
        section = '';
        continue;
      }
      if (!cur) continue;
      const s = /^###\s+(.*)$/.exec(riga);
      if (s) { section = clean(s[1]); continue; }
      const v = /^\s*[-*]\s+(.*)$/.exec(riga);
      if (v && clean(v[1])) cur.items.push({ section, text: clean(v[1]) });
    }
    return out.slice(0, max);
  }

  /** version.json del repository: dato esterno, accettato solo se ha la forma prevista. */
  function parseVersionJson(text) {
    let d;
    try { d = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return { ok: false, error: 'version.json non è un JSON valido.' }; }
    if (!d || typeof d !== 'object') return { ok: false, error: 'version.json è vuoto.' };
    const v = parseVersion(d.version);
    if (!v) return { ok: false, error: 'version.json non contiene un numero di versione valido.' };
    const zipM = ZIP_RE.exec(String(d.zip || ''));
    return {
      ok: true,
      version: v.text,
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) ? d.date : null,
      zip: zipM && zipM[1] === v.text ? d.zip : null,
      sha256: typeof d.sha256 === 'string' && SHA_RE.test(d.sha256) ? d.sha256 : null,
      notes: Array.isArray(d.notes) ? d.notes.filter((n) => typeof n === 'string').map((n) => clean(n).slice(0, 300)).filter(Boolean).slice(0, 12) : []
    };
  }

  /** Stato da mostrare confrontando la versione installata con l'ultima stabile. */
  function updateStatus(installed, latest) {
    if (!latest) return 'none';
    const c = compareVersions(latest.version, installed);
    if (c === null) return 'error';
    if (c > 0) return 'available';
    if (c < 0) return 'ahead';
    return 'uptodate';
  }

  /** Risposta HTTP di raw.githubusercontent.com → frase comprensibile. */
  function githubError(status, headers, now = Date.now()) {
    const get = (h) => (headers && typeof headers.get === 'function' ? headers.get(h) : headers && headers[h]);
    if (!status) return { kind: 'network', text: 'GitHub non è raggiungibile: controlla la connessione.' };
    if (status === 403 || status === 429) {
      const wait = Number(get('retry-after'));
      return { kind: 'ratelimit', reset: Number.isFinite(wait) && wait > 0 ? now + Math.min(wait, 3600) * 1000 : null,
        text: 'GitHub sta limitando le richieste da questa rete: riprova tra qualche minuto.' };
    }
    if (status === 404) return { kind: 'notfound', text: 'version.json non trovato: il repository è privato, ha cambiato nome o il file non è ancora pubblicato.' };
    return { kind: 'http', text: `GitHub ha risposto con un errore (HTTP ${status}).` };
  }

  /**
   * Controllo completo. fetchImpl riceve (url, init) e restituisce una Response.
   * Restituisce sempre un oggetto da salvare in updateCheck (mai eccezioni).
   */
  async function checkForUpdates({ repo, installed, fetchImpl, now = Date.now() }) {
    const base = `${RAW}/${repo}/main`;
    const init = { cache: 'no-store', credentials: 'omit' };
    const result = { at: now, repo, installed, ok: false, source: null, status: 'error', latest: null, prerelease: null, history: [], error: null };

    const get = async (url) => {
      try {
        const r = await fetchImpl(url, init);
        return { status: r.status, headers: r.headers, ok: r.ok, text: r.ok ? await r.text() : '' };
      } catch (e) {
        return { status: 0, headers: null, ok: false, text: '' };
      }
    };

    // 1. version.json: senza questo non c'è niente da confrontare.
    const vj = await get(`${base}/version.json`);
    if (!vj.ok) {
      const e = githubError(vj.status, vj.headers, now);
      result.error = e.text;
      result.errorKind = e.kind;
      if (e.reset) result.rateLimitReset = e.reset;
      return result;
    }
    const remote = parseVersionJson(vj.text);
    if (!remote.ok) { result.error = remote.error; result.errorKind = 'invalid'; return result; }

    // 2. CHANGELOG.md, facoltativo: se manca resta solo il registro vuoto.
    let history = [];
    const cl = await get(`${base}/CHANGELOG.md`);
    if (cl.ok) {
      history = parseChangelog(cl.text, 10).map((s) => ({
        version: s.version, date: s.date, prerelease: (parseVersion(s.version) || { pre: [] }).pre.length > 0,
        url: `https://github.com/${repo}/blob/HEAD/CHANGELOG.md`,
        notes: s.items.map((i) => (i.section ? `${i.section}: ${i.text}` : i.text)).slice(0, 12),
        hasNotes: s.items.length > 0, asset: null
      }));
    }

    const fromLog = history.find((h) => h.version === remote.version);
    result.ok = true;
    result.source = 'version-json';
    result.latest = {
      version: remote.version, prerelease: false, date: remote.date,
      url: `https://github.com/${repo}`,
      notes: remote.notes.length ? remote.notes : (fromLog ? fromLog.notes : []),
      hasNotes: remote.notes.length > 0 || Boolean(fromLog && fromLog.hasNotes),
      // Lo zip sta nella radice del repository (lo garantisce npm run check prima della release).
      asset: remote.zip ? { name: remote.zip, url: `https://github.com/${repo}/raw/HEAD/${remote.zip}`, sha256: remote.sha256, size: null } : null
    };
    result.history = history;
    result.status = updateStatus(installed, result.latest);
    return result;
  }

  /** Si può fare un nuovo controllo manuale? Uno al minuto, e non durante il blocco di GitHub. */
  function canCheck(last, now = Date.now()) {
    if (!last || !last.at) return true;
    if (last.rateLimitReset && now < last.rateLimitReset) return false;
    return now - last.at >= KW_UPDATE_COOLDOWN_MS;
  }

  /** Controllo automatico all'apertura del popup: al massimo uno al giorno. */
  function dueForAutoCheck(last, now = Date.now()) {
    if (!last || !last.at) return true;
    if (last.rateLimitReset && now < last.rateLimitReset) return false;
    return now - last.at >= KW_UPDATE_AUTO_MS;
  }

  const api = {
    RAW, KW_UPDATE_COOLDOWN_MS, KW_UPDATE_AUTO_MS, ZIP_RE,
    parseVersion, compareVersions, bulletsFrom, parseChangelog, parseVersionJson,
    updateStatus, githubError, checkForUpdates, canCheck, dueForAutoCheck
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KWUpdates = api;
})(typeof self !== 'undefined' ? self : globalThis);
