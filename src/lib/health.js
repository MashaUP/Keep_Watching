/**
 * Keep_Watching — stato del player, tentativi di recupero, verifiche e cronologia eventi.
 *
 * Logica pura, senza API del browser: la usano player.js (macchina a stati e tentativi),
 * il service worker (cronologia, riepilogo di "Verifica tutto") e il popup (testi).
 * Funziona come script classico (oggetto globale KWHealth) e in Node per i test.
 */
(function (root) {
  'use strict';

  // ---------- Macchina a stati del player ----------
  //
  // Uno stato descrive ciò che si osserva, non ciò che si spera: "playing" solo se il
  // video avanza, "stalled" solo dopo un periodo senza avanzamento mentre dovrebbe suonare.

  const STATES = {
    loading: { label: 'In caricamento', tone: 'wait', text: 'Il player si sta caricando: si aspetta il video.' },
    ready: { label: 'Pronto', tone: 'ok', text: 'Video caricato, non ancora avviato.' },
    playing: { label: 'In riproduzione', tone: 'ok', text: 'Il video avanza normalmente.' },
    paused: { label: 'In pausa', tone: 'ok', text: 'Video in pausa: nessun recupero mentre è fermo per scelta.' },
    buffering: { label: 'Caricamento dati', tone: 'wait', text: 'Il video aspetta dati dalla rete (buffering).' },
    stalled: { label: 'Bloccato', tone: 'warn', text: 'Il video dovrebbe suonare ma non avanza.' },
    recovering: { label: 'Recupero in corso', tone: 'warn', text: 'È in corso un tentativo di farlo ripartire.' },
    switching: { label: 'Cambio episodio', tone: 'wait', text: 'Il passaggio al prossimo episodio è in corso.' },
    ended: { label: 'Episodio finito', tone: 'ok', text: 'Il video è arrivato alla fine.' },
    error: { label: 'Errore recuperabile', tone: 'warn', text: 'Si è verificato un errore che un nuovo tentativo può risolvere.' },
    fatal: { label: 'Serve un\'azione', tone: 'error', text: 'L\'estensione non può risolvere da sola: serve un tuo intervento.' },
    unsupported: { label: 'Non compatibile', tone: 'error', text: 'Il player non ha la struttura prevista: le funzioni automatiche non sono disponibili.' }
  };

  // Eventi → stato. "*" vale da qualsiasi stato; le chiavi specifiche hanno la precedenza.
  // Gli eventi che non compaiono per lo stato attuale non lo cambiano (restano ignorati).
  const TRANSITIONS = {
    '*': {
      'video-ready': 'ready', playing: 'playing', progress: 'playing', pause: 'paused', ended: 'ended',
      waiting: 'buffering', 'stall-detected': 'stalled', 'recovery-start': 'recovering',
      'recovery-failed': 'error', 'next-start': 'switching', 'next-failed': 'error',
      error: 'error', 'manual-needed': 'fatal', 'video-missing': 'unsupported'
    },
    // Durante il cambio episodio contano solo esito e fine documento: pause e buffering
    // del vecchio video non devono far sembrare annullato il cambio.
    switching: { pause: null, waiting: null, progress: null, playing: null, 'next-failed': 'error', 'manual-needed': 'fatal' },
    // Un player incompatibile resta tale finché non compare davvero un video che suona.
    unsupported: { pause: null, waiting: null, 'stall-detected': null, playing: 'playing', progress: 'playing', 'video-ready': 'ready' },
    // In recupero l'avanzamento vero chiude il tentativo (con esito positivo).
    recovering: { pause: 'paused', waiting: null, 'stall-detected': null, 'recovery-start': null },
    // Da bloccato si esce solo se il video avanza davvero o se l'utente mette in pausa.
    stalled: { waiting: null, 'stall-detected': null, 'video-ready': null }
  };

  /** Nuovo stato dopo un evento; null se l'evento non cambia lo stato. */
  function nextState(state, event) {
    const specific = TRANSITIONS[state];
    if (specific && Object.prototype.hasOwnProperty.call(specific, event)) {
      const to = specific[event];
      return to && to !== state ? to : null;
    }
    const to = TRANSITIONS['*'][event];
    return to && to !== state ? to : null;
  }

  /**
   * Macchina a stati con cronologia breve. onChange(to, from, event, detail) viene chiamato
   * solo quando lo stato cambia davvero.
   */
  function createMachine(initial = 'loading', onChange = null, now = () => Date.now()) {
    const m = { state: initial, since: now(), history: [] };
    m.send = (event, detail) => {
      const to = nextState(m.state, event);
      if (!to) return false;
      const from = m.state;
      m.state = to;
      m.since = now();
      m.history.push({ from, to, event, at: m.since });
      if (m.history.length > 20) m.history.shift();
      if (onChange) onChange(to, from, event, detail);
      return true;
    };
    m.is = (...states) => states.includes(m.state);
    return m;
  }

  // ---------- Tentativi con limite, attesa progressiva e pausa dopo i fallimenti ----------

  /**
   * Politica dei tentativi: al massimo `max` tentativi; tra uno e l'altro un'attesa che
   * cresce (base × factor^n, con un po' di casualità per non sincronizzarsi); dopo `max`
   * fallimenti nessun tentativo per `cooldownMs`. Un solo tentativo alla volta.
   */
  function createRetry({ max = 2, baseMs = 2000, factor = 2, jitter = 0.2, cooldownMs = 3 * 60 * 1000, random = Math.random } = {}) {
    const r = { attempts: 0, inFlight: false, blockedUntil: 0, lastAt: 0 };
    r.delay = () => Math.round(baseMs * factor ** r.attempts * (1 + (random() * 2 - 1) * jitter));
    r.canAttempt = (t = Date.now()) => !r.inFlight && t >= r.blockedUntil && r.attempts < max;
    r.begin = (t = Date.now()) => {
      if (!r.canAttempt(t)) return false;
      r.inFlight = true;
      r.attempts += 1;
      r.lastAt = t;
      return true;
    };
    r.succeed = () => { r.inFlight = false; r.attempts = 0; };
    r.fail = (t = Date.now()) => {
      r.inFlight = false;
      if (r.attempts >= max) r.blockedUntil = t + cooldownMs;
    };
    r.reset = () => { r.attempts = 0; r.inFlight = false; r.blockedUntil = 0; };
    return r;
  }

  // ---------- Avvio con la scheda nascosta ----------
  // Attese tra un tentativo e l'altro (ms): sei tentativi in circa 70 secondi, poi si smette.
  const BACKGROUND_PLAY_DELAYS = [1500, 3000, 6000, 10000, 20000, 30000];

  // ---------- Errori del video ----------

  /** Codici di MediaError (HTML5): cosa vuol dire e se ha senso riprovare. */
  function classifyMediaError(code) {
    switch (Number(code)) {
      case 1: return { code: 1, kind: 'aborted', label: 'Caricamento interrotto', recoverable: false,
        text: 'Il caricamento del video è stato interrotto (di solito da un cambio pagina).' };
      case 2: return { code: 2, kind: 'network', label: 'Errore di rete', recoverable: true,
        text: 'Il video non riceve dati dalla rete.' };
      case 3: return { code: 3, kind: 'decode', label: 'Errore di decodifica', recoverable: true,
        text: 'Il browser non riesce a decodificare una parte del video.' };
      case 4: return { code: 4, kind: 'source', label: 'Sorgente non disponibile', recoverable: true,
        text: 'La sorgente del video non è disponibile o non è supportata (per esempio un collegamento scaduto).' };
      default: return { code: Number(code) || 0, kind: 'unknown', label: 'Errore del video', recoverable: true,
        text: 'Il player ha segnalato un errore senza codice.' };
    }
  }

  // ---------- Verifiche ("Verifica tutto") ----------

  // Tre esiti principali, con un dettaglio per distinguere i casi.
  const CHECK = { ok: 'Funzionante', check: 'Da verificare', na: 'Non disponibile' };
  // Dettagli: off = disattivata da te; idle = disponibile ma non attiva ora; unsupported =
  // il sito non la consente; error = in errore; unverified = presente ma non provata.
  const DETAIL = {
    off: 'Disattivata nelle impostazioni',
    idle: 'Disponibile, non attiva in questo momento',
    unsupported: 'Non supportata da questa pagina',
    error: 'In errore',
    unverified: 'Presente, ma non provata davvero',
    verified: 'Verificata adesso'
  };

  function check(id, label, status, text, extra = {}) {
    return { id, label, status, text, ...extra };
  }

  /** Riepilogo: quante verifiche per esito e un esito complessivo. */
  function summarize(checks) {
    const count = { ok: 0, check: 0, na: 0 };
    for (const c of checks || []) if (count[c.status] !== undefined) count[c.status] += 1;
    const errors = (checks || []).filter((c) => c.status === 'na' && c.detail === 'error').length;
    const overall = errors ? 'error' : count.na ? 'partial' : count.check ? 'check' : 'ok';
    return { ...count, errors, overall };
  }

  // ---------- Cronologia eventi ----------

  const LOG_MAX = 300;
  const LOG_GROUP_MS = 10 * 60 * 1000;
  const LEVELS = ['info', 'warn', 'error'];
  const CATEGORIES = ['extension', 'site', 'player', 'next', 'skip', 'recovery', 'health', 'settings'];

  const clip = (v, n) => (v == null ? undefined : String(v).slice(0, n));
  // Niente parametri degli URL (possono contenere token), niente indirizzi completi.
  const scrub = (v, n) => {
    const s = clip(v, n);
    return s && s.replace(/https?:\/\/[^\s"']+/g, (u) => {
      try { const x = new URL(u); return `${x.host}${x.pathname}`; } catch (e) { return '[indirizzo]'; }
    }).replace(/\b(token|expires|key|auth|session)=[^&\s]+/gi, '$1=…');
  };

  /** Evento ripulito: solo i campi previsti, testi brevi, nessun dato sensibile. */
  function cleanEvent(ev, t = Date.now()) {
    if (!ev || typeof ev !== 'object' || typeof ev.msg !== 'string' || !ev.msg.trim()) return null;
    const out = {
      at: Number.isFinite(ev.at) ? ev.at : t,
      cat: CATEGORIES.includes(ev.cat) ? ev.cat : 'extension',
      level: LEVELS.includes(ev.level) ? ev.level : 'info',
      msg: scrub(ev.msg.trim(), 160),
      fn: scrub(ev.fn, 40),
      from: scrub(ev.from, 30),
      to: scrub(ev.to, 30),
      action: scrub(ev.action, 120),
      result: scrub(ev.result, 120)
    };
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out;
  }

  function emptyLog() { return { schema: 1, events: [] }; }

  function validLog(raw) {
    if (!raw || raw.schema !== 1 || !Array.isArray(raw.events)) return emptyLog();
    return { schema: 1, events: raw.events.map((e) => ({ ...cleanEvent(e, e && e.at), count: Math.max(1, Math.floor(Number(e && e.count) || 1)), lastAt: Number(e && e.lastAt) || (e && e.at) })).filter((e) => e.msg) };
  }

  /**
   * Aggiunge un evento. Lo stesso evento (categoria, livello, funzione, messaggio, esito)
   * entro 10 minuti dal precedente non crea una riga nuova: ne aumenta il conteggio.
   * Così un player bloccato non riempie la cronologia. Al massimo LOG_MAX righe.
   */
  function addEvent(log, ev, t = Date.now()) {
    const e = cleanEvent(ev, t);
    if (!e) return { log, added: false };
    const key = (x) => [x.cat, x.level, x.fn, x.msg, x.result].join('|');
    const last = log.events[log.events.length - 1];
    if (last && key(last) === key(e) && e.at - (last.lastAt || last.at) < LOG_GROUP_MS) {
      last.count = (last.count || 1) + 1;
      last.lastAt = e.at;
      return { log, added: false, grouped: true };
    }
    log.events.push({ ...e, count: 1, lastAt: e.at });
    if (log.events.length > LOG_MAX) log.events.splice(0, log.events.length - LOG_MAX);
    return { log, added: true };
  }

  function logToJSON(log, now = Date.now(), version = '') {
    return {
      schema: 'keep-watching-log', version: 1, generatedAt: new Date(now).toISOString(),
      extensionVersion: version || undefined,
      events: log.events.map((e) => ({ ...e, at: new Date(e.at).toISOString(), lastAt: new Date(e.lastAt || e.at).toISOString() }))
    };
  }

  const api = {
    STATES, TRANSITIONS, nextState, createMachine, createRetry, classifyMediaError, BACKGROUND_PLAY_DELAYS,
    CHECK, DETAIL, check, summarize,
    LOG_MAX, LOG_GROUP_MS, LEVELS, CATEGORIES, cleanEvent, emptyLog, validLog, addEvent, logToJSON
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KWHealth = api;
})(typeof self !== 'undefined' ? self : globalThis);
