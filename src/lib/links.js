/**
 * Keep Watching — collegamenti ufficiali del progetto (GitHub, Discord, Ko-fi, guida, segnalazioni).
 *
 * Unica fonte per gli indirizzi mostrati nel menu: i componenti leggono solo da qui
 * (KWLinks.resolve), mai indirizzi scritti a mano.
 *
 * Due livelli:
 *   1. DEFAULTS qui sotto: sempre disponibili, anche senza rete.
 *   2. Configurazione remota facoltativa: links.json nella radice del repository GitHub,
 *      letta dal menu al massimo una volta ogni 12 ore. Permette di cambiare, per esempio,
 *      l'invito Discord senza pubblicare una nuova versione. È solo dati: viene validata
 *      campo per campo e ogni indirizzo deve essere https su un dominio dell'elenco.
 *
 * Logica pura (nessuna API del browser tranne fetch passata da fuori): oggetto globale
 * KWLinks negli script classici, module.exports in Node per i test.
 */
(function (root) {
  'use strict';

  const REPO = 'MashaUP/Keep_Watching';
  const REMOTE_URL = `https://api.github.com/repos/${REPO}/contents/links.json`;
  const REMOTE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
  const REMOTE_TIMEOUT_MS = 5000;
  const REMOTE_MAX_BYTES = 20000;
  const MAX_LINKS = 8;

  // Domini accettati per i collegamenti (anche dalla configurazione remota). Aggiungere un
  // servizio legittimo vuol dire aggiungere qui il suo dominio, in una nuova versione.
  const ALLOWED_HOSTS = ['github.com', 'discord.gg', 'discord.com', 'ko-fi.com'];
  const ALLOWED_SUFFIXES = ['.github.io']; // pagine di documentazione su GitHub Pages

  // Icone disponibili nel menu (simboli SVG di popup.html). Generiche, non marchi.
  const ICONS = ['i-code', 'i-chat', 'i-cup', 'i-book', 'i-bug', 'i-bulb', 'i-link'];

  /**
   * Collegamenti di serie. enabled: false = predisposto ma non mostrato (destinazione da
   * confermare). Le pagine di segnalazione usano le Issues di GitHub: vanno accese (qui o
   * in links.json) solo dopo aver verificato che le Issues sono attive nel repository.
   */
  const DEFAULTS = [
    { id: 'github', label: 'GitHub', description: 'Codice, versioni e novità di Keep Watching', url: `https://github.com/${REPO}`, icon: 'i-code', category: 'project', enabled: true },
    { id: 'discord', label: 'Discord', description: 'Community di Keep Watching', url: 'https://discord.gg/EPsbQCuAkx', icon: 'i-chat', category: 'community', enabled: true },
    { id: 'kofi', label: 'Ko-fi', description: 'Offri un caffè per sostenere il progetto', url: 'https://ko-fi.com/mashaup', icon: 'i-cup', category: 'support', enabled: true },
    { id: 'documentation', label: 'Guida', description: 'Istruzioni complete (README su GitHub)', url: `https://github.com/${REPO}#readme`, icon: 'i-book', category: 'help', enabled: true },
    { id: 'bug-report', label: 'Segnala un problema', description: 'Apri una segnalazione su GitHub', url: `https://github.com/${REPO}/issues/new`, icon: 'i-bug', category: 'help', enabled: false },
    { id: 'feature-request', label: 'Proponi una funzione', description: 'Suggerisci un miglioramento su GitHub', url: `https://github.com/${REPO}/issues/new`, icon: 'i-bulb', category: 'help', enabled: false }
  ];

  const ID_RE = /^[a-z][a-z0-9-]{1,30}$/;
  const clean = (s, n) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n) : '');

  /** Indirizzo accettabile: https, dominio dell'elenco, niente credenziali. null se no. */
  function validUrl(url) {
    if (typeof url !== 'string' || url.length > 300) return null;
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase();
    const ok = ALLOWED_HOSTS.some((h) => host === h || host === `www.${h}`) || ALLOWED_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
    return ok ? u.href : null;
  }

  /**
   * Configurazione remota (testo JSON) → { ok, data, error }. Formato:
   *   { "schema": 1, "links": { "discord": { "url": "https://discord.gg/…", "enabled": true }, … } }
   * Per un id già noto si possono cambiare url, enabled, label, description; un id nuovo
   * richiede label e url (l'icona, se non è tra quelle disponibili, diventa un link generico).
   */
  function parseRemote(text) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'configurazione vuota' };
    if (text.length > REMOTE_MAX_BYTES) return { ok: false, error: 'configurazione troppo grande' };
    let raw;
    try { raw = JSON.parse(text); } catch (e) { return { ok: false, error: 'JSON non valido' }; }
    if (!raw || typeof raw !== 'object' || raw.schema !== 1 || !raw.links || typeof raw.links !== 'object' || Array.isArray(raw.links)) {
      return { ok: false, error: 'formato non riconosciuto (serve "schema": 1 e "links")' };
    }
    const links = {};
    const rejected = [];
    for (const [id, v] of Object.entries(raw.links).slice(0, MAX_LINKS * 2)) {
      if (!ID_RE.test(id) || !v || typeof v !== 'object') { rejected.push(id); continue; }
      const entry = {};
      if ('url' in v) {
        const url = validUrl(v.url);
        if (!url) { rejected.push(id); continue; }
        entry.url = url;
      }
      if ('enabled' in v) {
        if (typeof v.enabled !== 'boolean') { rejected.push(id); continue; }
        entry.enabled = v.enabled;
      }
      if (typeof v.label === 'string' && clean(v.label, 40)) entry.label = clean(v.label, 40);
      if (typeof v.description === 'string') entry.description = clean(v.description, 120);
      if (typeof v.icon === 'string' && ICONS.includes(v.icon)) entry.icon = v.icon;
      links[id] = entry;
    }
    return { ok: true, data: { schema: 1, links }, rejected };
  }

  /**
   * Elenco finale: i collegamenti di serie con le modifiche remote valide sopra. Ogni
   * collegamento è validato anche qui: uno senza indirizzo valido risulta disattivato.
   */
  function resolve(remote) {
    const over = (remote && remote.links) || {};
    const out = DEFAULTS.map((d) => ({ ...d, ...(over[d.id] || {}), source: over[d.id] ? 'remote' : 'local' }));
    for (const [id, v] of Object.entries(over)) {
      if (out.some((l) => l.id === id) || out.length >= MAX_LINKS) continue;
      if (!v.url || !v.label) continue; // un collegamento nuovo deve dire dove porta e come si chiama
      out.push({ id, label: v.label, description: v.description || '', url: v.url, icon: v.icon || 'i-link', category: 'other', enabled: v.enabled !== false, source: 'remote' });
    }
    return out.map((l) => {
      const url = validUrl(l.url);
      return { ...l, url, enabled: Boolean(l.enabled && url) };
    });
  }

  const get = (links, id) => (links || []).find((l) => l.id === id && l.enabled) || null;

  /** La configurazione in cache va rinnovata? */
  const due = (cache, now = Date.now()) => !cache || !cache.at || now - cache.at > REMOTE_MAX_AGE_MS;

  /**
   * Legge links.json dal repository. Restituisce sempre un oggetto, mai eccezioni:
   *   { ok: true, data } — configurazione valida;
   *   { ok: false, missing: true } — il file non esiste (configurazione remota non pubblicata);
   *   { ok: false, error } — rete, timeout, limite di GitHub o contenuto non valido.
   */
  async function fetchRemote(fetchImpl, { timeoutMs = REMOTE_TIMEOUT_MS } = {}) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await fetchImpl(REMOTE_URL, {
        headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store', credentials: 'omit',
        signal: ctrl ? ctrl.signal : undefined
      });
      if (res.status === 404) return { ok: false, missing: true, error: 'links.json non pubblicato nel repository' };
      if (!res.ok) return { ok: false, error: `GitHub ha risposto ${res.status}` };
      const parsed = parseRemote(await res.text());
      return parsed.ok ? { ok: true, data: parsed.data, rejected: parsed.rejected } : { ok: false, error: parsed.error };
    } catch (e) {
      return { ok: false, error: e && e.name === 'AbortError' ? 'tempo scaduto' : 'rete non disponibile' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Nuovo stato della cache dopo un tentativo:
   *   valida → si salva; file assente → si cancella (si torna ai collegamenti di serie);
   *   errore → si tiene quella che c'era (anche vecchia), segnando l'ultimo tentativo.
   */
  function nextCache(prev, result, now = Date.now()) {
    if (result.ok) return { at: now, checkedAt: now, data: result.data };
    if (result.missing) return { at: now, checkedAt: now, data: null };
    return { ...(prev || { data: null }), at: now, checkedAt: now, lastError: result.error, okAt: prev && (prev.okAt || (prev.data ? prev.at : null)) };
  }

  const api = { REPO, REMOTE_URL, REMOTE_MAX_AGE_MS, ALLOWED_HOSTS, ICONS, DEFAULTS, validUrl, parseRemote, resolve, get, due, fetchRemote, nextCache };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KWLinks = api;
})(typeof self !== 'undefined' ? self : globalThis);
