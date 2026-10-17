/**
 * Keep_Watching — centro aggiornamenti (funzioni pure + un controllo con fetch iniettabile).
 *
 * Fonte ufficiale: il repository GitHub in KW_LINKS.repo (src/defaults.js).
 * Ordine di lettura, tutte richieste anonime all'API pubblica di GitHub:
 *   1. Release GitHub (GET /repos/{repo}/releases): se ce ne sono, si usano quelle.
 *      Le bozze sono ignorate, le prerelease mostrate ma mai proposte come aggiornamento.
 *   2. Altrimenti version.json nella radice del repository (come Vinted_Relist), con
 *      verifica che lo zip indicato esista davvero nel repository, e CHANGELOG.md per
 *      il registro delle versioni.
 * Nessun dato locale viene inviato: niente cookie (credentials: 'omit'), niente parametri.
 * Il codice scaricato non viene mai eseguito: lo zip si apre in una scheda e lo estrae l'utente.
 */
(function (root) {
  'use strict';

  const API = 'https://api.github.com';
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
      notes: Array.isArray(d.notes) ? d.notes.filter((n) => typeof n === 'string').map((n) => clean(n).slice(0, 240)).slice(0, 12) : []
    };
  }

  // ---------- Release GitHub ----------

  /** Lo zip giusto di una release: Keep_Watching-<versione>.zip, oppure l'unico zip presente. */
  function pickAsset(release) {
    const assets = Array.isArray(release && release.assets) ? release.assets : [];
    const version = (parseVersion(release.tag_name) || {}).text;
    const exact = assets.find((a) => { const m = ZIP_RE.exec(a.name || ''); return m && m[1] === version; });
    if (exact) return { name: exact.name, url: exact.browser_download_url, size: exact.size || null };
    const zips = assets.filter((a) => /\.zip$/i.test(a.name || '') && /keep[_-]?watching/i.test(a.name || ''));
    if (zips.length === 1) return { name: zips[0].name, url: zips[0].browser_download_url, size: zips[0].size || null };
    return null;
  }

  /** Release valide, dalla più recente; le bozze e i tag non semantici sono scartati. */
  function normalizeReleases(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((r) => r && !r.draft && parseVersion(r.tag_name))
      .map((r) => ({
        version: parseVersion(r.tag_name).text,
        prerelease: Boolean(r.prerelease) || parseVersion(r.tag_name).pre.length > 0,
        date: r.published_at ? String(r.published_at).slice(0, 10) : null,
        url: typeof r.html_url === 'string' && r.html_url.startsWith('https://github.com/') ? r.html_url : null,
        notes: bulletsFrom(r.body),
        hasNotes: Boolean(r.body && String(r.body).trim()),
        asset: pickAsset(r)
      }))
      .sort((a, b) => compareVersions(b.version, a.version));
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

  /** Risposta HTTP di GitHub → frase comprensibile. */
  function githubError(status, headers) {
    const get = (h) => (headers && typeof headers.get === 'function' ? headers.get(h) : headers && headers[h]);
    if (!status) return { kind: 'network', text: 'GitHub non è raggiungibile: controlla la connessione.' };
    if ((status === 403 || status === 429) && (get('x-ratelimit-remaining') === '0' || status === 429)) {
      const reset = Number(get('x-ratelimit-reset')) * 1000;
      return { kind: 'ratelimit', reset: Number.isFinite(reset) && reset > 0 ? reset : null,
        text: 'GitHub ha raggiunto il limite di richieste da questa rete (60 all\'ora senza accesso): riprova più tardi.' };
    }
    if (status === 404) return { kind: 'notfound', text: 'Repository non trovato o privato: il controllo funziona solo con un repository pubblico.' };
    if (status === 403) return { kind: 'forbidden', text: 'GitHub ha rifiutato la richiesta (HTTP 403).' };
    return { kind: 'http', text: `GitHub ha risposto con un errore (HTTP ${status}).` };
  }

  /**
   * Controllo completo. fetchImpl riceve (url, init) e restituisce una Response.
   * Restituisce sempre un oggetto da salvare in updateCheck (mai eccezioni).
   */
  async function checkForUpdates({ repo, installed, fetchImpl, now = Date.now() }) {
    const base = `${API}/repos/${repo}`;
    const init = (accept) => ({ headers: { Accept: accept }, cache: 'no-store', credentials: 'omit' });
    const result = { at: now, repo, installed, ok: false, source: null, status: 'error', latest: null, prerelease: null, history: [], error: null };

    const get = async (url, accept) => {
      try {
        const r = await fetchImpl(url, init(accept));
        return { status: r.status, headers: r.headers, ok: r.ok, text: r.ok ? await r.text() : '' };
      } catch (e) {
        return { status: 0, headers: null, ok: false, text: '' };
      }
    };
    const fail = (resp) => {
      const e = githubError(resp.status, resp.headers);
      result.error = e.text;
      result.errorKind = e.kind;
      if (e.reset) result.rateLimitReset = e.reset;
      return result;
    };

    // 1. Release GitHub
    // Un repository pubblico risponde sempre 200 (anche con zero release): 404 vuol dire
    // repository inesistente o privato.
    const rel = await get(`${base}/releases?per_page=15`, 'application/vnd.github+json');
    if (!rel.ok) return fail(rel);
    {
      let list;
      try { list = normalizeReleases(JSON.parse(rel.text)); } catch (e) { list = []; }
      if (list.length) {
        const stable = list.find((r) => !r.prerelease) || null;
        const pre = list.find((r) => r.prerelease) || null;
        result.ok = true;
        result.source = 'releases';
        result.latest = stable;
        result.prerelease = pre && (!stable || compareVersions(pre.version, stable.version) > 0) ? pre : null;
        result.history = list.slice(0, 10);
        result.status = stable ? updateStatus(installed, stable) : 'none';
        return result;
      }
    }

    // 2. version.json + elenco dei file + CHANGELOG.md
    const vj = await get(`${base}/contents/version.json`, 'application/vnd.github.raw+json');
    if (!vj.ok) {
      if (vj.status === 404) {
        result.error = 'Nel repository non ci sono né release né version.json: nessuna versione pubblicata da confrontare.';
        result.errorKind = 'nothing';
        return result;
      }
      return fail(vj);
    }
    const remote = parseVersionJson(vj.text);
    if (!remote.ok) { result.error = remote.error; result.errorKind = 'invalid'; return result; }

    let asset = null;
    if (remote.zip) {
      const listing = await get(`${base}/contents/`, 'application/vnd.github+json');
      if (listing.ok) {
        try {
          const files = JSON.parse(listing.text);
          const f = Array.isArray(files) && files.find((x) => x && x.type === 'file' && x.name === remote.zip);
          if (f && typeof f.download_url === 'string' && f.download_url.startsWith('https://')) {
            asset = { name: f.name, url: f.download_url, size: f.size || null };
          }
        } catch (e) { /* elenco illeggibile: niente download diretto */ }
      }
    }

    let history = [];
    const cl = await get(`${base}/contents/CHANGELOG.md`, 'application/vnd.github.raw+json');
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
      asset
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
    KW_UPDATE_COOLDOWN_MS, KW_UPDATE_AUTO_MS, ZIP_RE,
    parseVersion, compareVersions, bulletsFrom, parseChangelog, parseVersionJson,
    pickAsset, normalizeReleases, updateStatus, githubError, checkForUpdates, canCheck, dueForAutoCheck
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KWUpdates = api;
})(typeof self !== 'undefined' ? self : globalThis);
