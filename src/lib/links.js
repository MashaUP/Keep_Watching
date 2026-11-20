/**
 * Keep Watching — collegamenti ufficiali del progetto (GitHub, Discord, Ko-fi, guida,
 * novità, segnalazioni, idee).
 *
 * Unica fonte per gli indirizzi mostrati nel menu: i componenti leggono solo da qui
 * (KWLinks.resolve), mai indirizzi scritti a mano.
 *
 * Due livelli (claude/standard-comuni.md, sezione 1):
 *   1. DEFAULTS qui sotto: sempre disponibili, anche senza rete (uguali a links.json, lo
 *      controlla npm run check).
 *   2. links.json su main, letto da raw.githubusercontent.com al massimo ogni 12 ore e a
 *      ogni «Cerca aggiornamento». È solo dati: ogni voce è validata da sola e ogni
 *      indirizzo deve essere https su un host consentito per quel collegamento.
 *
 * Logica pura (nessuna API del browser tranne fetch passata da fuori): oggetto globale
 * KWLinks negli script classici, module.exports in Node per i test.
 */
(function (root) {
  'use strict';

  const REPO = 'MashaUP/Keep_Watching';
  const REMOTE_URL = `https://raw.githubusercontent.com/${REPO}/main/links.json`;
  const REMOTE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
  const REMOTE_TIMEOUT_MS = 5000;
  const REMOTE_MAX_BYTES = 20000;
  const MAX_LINKS = 10;

  // Host accettati (standard comune). github, discord e kofi accettano solo il proprio.
  const ALLOWED_HOSTS = ['github.com', 'discord.gg', 'discord.com', 'ko-fi.com', 'mashaup.github.io'];
  const HOSTS_BY_ID = { github: ['github.com'], discord: ['discord.gg', 'discord.com'], kofi: ['ko-fi.com'] };

  // Icone disponibili nel menu (simboli SVG di popup.html). Generiche, non marchi.
  const ICONS = ['i-code', 'i-chat', 'i-cup', 'i-book', 'i-list', 'i-bug', 'i-bulb', 'i-link'];

  // Icone piccole in basso a sinistra: solo questi; gli altri stanno in «Community e aiuto».
  const NAV_IDS = ['github', 'discord', 'kofi', 'documentation'];

  /** Collegamenti di serie (gli stessi di links.json nella radice del repository). */
  const DEFAULTS = [
    { id: 'github', label: 'GitHub', description: 'Codice, versioni e novità di Keep Watching', url: `https://github.com/${REPO}`, icon: 'i-code', category: 'project', enabled: true },
    { id: 'discord', label: 'Discord', description: 'Community di Keep Watching', url: 'https://discord.gg/EPsbQCuAkx', icon: 'i-chat', category: 'community', enabled: true },
    { id: 'kofi', label: 'Ko-fi', description: 'Offri un caffè per sostenere il progetto', url: 'https://ko-fi.com/mashaup', icon: 'i-cup', category: 'support', enabled: true },
    { id: 'documentation', label: 'Guida', description: 'Istruzioni complete (README su GitHub)', url: `https://github.com/${REPO}#readme`, icon: 'i-book', category: 'help', enabled: true },
    { id: 'changelog', label: 'Novità', description: 'Cosa è cambiato in ogni versione', url: `https://github.com/${REPO}/blob/main/CHANGELOG.md`, icon: 'i-list', category: 'help', enabled: true },
    { id: 'bugs', label: 'Segnala un problema', description: 'Apri una segnalazione su GitHub', url: `https://github.com/${REPO}/issues/new?template=bug.yml`, icon: 'i-bug', category: 'help', enabled: true },
    { id: 'ideas', label: 'Proponi un\'idea', description: 'Suggerisci un miglioramento su GitHub', url: `https://github.com/${REPO}/issues/new?template=idea.yml`, icon: 'i-bulb', category: 'help', enabled: true }
  ];

  const ID_RE = /^[a-z]{2,30}$/; // solo lettere minuscole (standard comune)
  // eslint-disable-next-line no-control-regex -- si tolgono apposta i caratteri di controllo
  const clean = (s, n) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n) : '');

  /** Indirizzo accettabile per quel collegamento: https, host consentito, niente credenziali. null se no. */
  function validUrl(url, id) {
    if (typeof url !== 'string' || url.length > 300) return null;
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    const hosts = HOSTS_BY_ID[id] || ALLOWED_HOSTS;
    return hosts.includes(u.hostname.toLowerCase()) ? u.href : null;
  }

  /**
   * links.json (testo) → { ok, data, rejected, error }. Formato della sezione 1:
   *   { "schemaVersion": 1, "project": "keep-watching", "revision": 3,
   *     "links": { "discord": { "url": "https://discord.gg/…", "enabled": true, "label": "Discord" }, … } }
   * Campi di una voce: url, enabled, label, facoltativi description, icon, order; gli altri si
   * ignorano. Una voce non valida viene scartata da sola e resta il valore di serie. Un id
   * nuovo richiede label e url (l'icona, se non è tra quelle del menu, è un link generico).
   */
  function parseRemote(text) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'configurazione vuota' };
    if (text.length > REMOTE_MAX_BYTES) return { ok: false, error: 'configurazione troppo grande' };
    let raw;
    try { raw = JSON.parse(text); } catch (e) { return { ok: false, error: 'JSON non valido' }; }
    if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 1 || !raw.links || typeof raw.links !== 'object' || Array.isArray(raw.links)) {
      return { ok: false, error: 'formato non riconosciuto (serve "schemaVersion": 1 e "links")' };
    }
    const links = {};
    const rejected = [];
    for (const [id, v] of Object.entries(raw.links).slice(0, MAX_LINKS * 2)) {
      if (!ID_RE.test(id) || !v || typeof v !== 'object' || Array.isArray(v)) { rejected.push(id); continue; }
      const entry = {};
      if ('url' in v) {
        const url = validUrl(v.url, id);
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
      if (Number.isInteger(v.order) && v.order >= 0 && v.order < 100) entry.order = v.order;
      links[id] = entry;
    }
    const revision = Number.isInteger(raw.revision) && raw.revision > 0 ? raw.revision : null;
    return { ok: true, data: { schemaVersion: 1, revision, links }, rejected };
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
      out.push({ id, label: v.label, description: v.description || '', url: v.url, icon: v.icon || 'i-link', category: 'other', enabled: v.enabled !== false, order: v.order, source: 'remote' });
    }
    // order (facoltativo, da 0) mette il collegamento in quella posizione, davanti a quello
    // che c'era; senza, vale la sua posizione nell'elenco di serie.
    const ordered = out.map((l, i) => ({ l, k: Number.isInteger(l.order) ? l.order - 0.5 : i }))
      .sort((a, b) => a.k - b.k).map((x) => x.l);
    return ordered.map((l) => {
      const url = validUrl(l.url, l.id);
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
      const res = await fetchImpl(REMOTE_URL, { cache: 'no-store', credentials: 'omit', signal: ctrl ? ctrl.signal : undefined });
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

  const api = { REPO, REMOTE_URL, REMOTE_MAX_AGE_MS, ALLOWED_HOSTS, HOSTS_BY_ID, ICONS, NAV_IDS, DEFAULTS, validUrl, parseRemote, resolve, get, due, fetchRemote, nextCache };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KWLinks = api;
})(typeof self !== 'undefined' ? self : globalThis);
