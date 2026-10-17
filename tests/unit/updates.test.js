'use strict';
const assert = require('assert/strict');
const U = require('../../src/lib/updates.js');

const REPO = 'MashaUP/Keep_Watching';
const API = `https://api.github.com/repos/${REPO}`;

/** fetch finto: mappa URL → { status, body, headers } oppure 'rete' per un errore di rete. */
function fakeFetch(routes, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    const r = routes[url];
    if (r === 'rete' || r === undefined) throw new TypeError('Failed to fetch');
    const headers = new Map(Object.entries(r.headers || {}));
    return {
      status: r.status, ok: r.status >= 200 && r.status < 300,
      headers: { get: (h) => headers.get(h.toLowerCase()) ?? null },
      text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body))
    };
  };
}

const release = (tag, extra = {}) => ({
  tag_name: tag, draft: false, prerelease: false, published_at: '2026-10-17T10:00:00Z',
  html_url: `https://github.com/${REPO}/releases/tag/${tag}`,
  body: '### Aggiunto\n- **Statistiche** locali\n- Centro aggiornamenti',
  assets: [{ name: `Keep_Watching-${tag.replace(/^v/, '')}.zip`, browser_download_url: `https://github.com/${REPO}/releases/download/${tag}/Keep_Watching-${tag.replace(/^v/, '')}.zip`, size: 40000 }],
  ...extra
});

const CHANGELOG = '# Changelog\n\n## [1.4.0] - 2026-10-17\n\n### Aggiunto\n- Statistiche\n\n### Corretto\n- Il pulsante **+60 s** non sparisce più\n\n## [1.3.0] - 2026-10-09\n\n### Aggiunto\n- Salto intro\n';
const VERSION_JSON = { version: '1.4.0', date: '2026-10-17', zip: 'Keep_Watching-1.4.0.zip', notes: ['Statistiche locali', 'Centro aggiornamenti'] };
const LISTING = [
  { type: 'file', name: 'Keep_Watching-1.4.0.zip', download_url: `https://raw.githubusercontent.com/${REPO}/main/Keep_Watching-1.4.0.zip`, size: 41000 },
  { type: 'file', name: 'version.json', download_url: 'https://raw.githubusercontent.com/x/version.json' }
];
const versionJsonRoutes = (vj = VERSION_JSON, listing = LISTING) => ({
  [`${API}/releases?per_page=15`]: { status: 200, body: [] },
  [`${API}/contents/version.json`]: { status: 200, body: vj },
  [`${API}/contents/`]: { status: 200, body: listing },
  [`${API}/contents/CHANGELOG.md`]: { status: 200, body: CHANGELOG }
});

module.exports = async () => {
  await test('versioni: confronto semantico, prefisso v, prerelease', () => {
    assert.equal(U.compareVersions('1.10.0', '1.9.0'), 1);
    assert.equal(U.compareVersions('v1.4.0', '1.4.0'), 0);
    assert.equal(U.compareVersions('1.4.0-beta.2', '1.4.0'), -1);
    assert.equal(U.compareVersions('1.4.0-beta.10', '1.4.0-beta.2'), 1);
    assert.equal(U.compareVersions('1.4.0-alpha', '1.4.0-beta'), -1);
    assert.equal(U.compareVersions('1.3.9', '1.4.0'), -1);
    assert.equal(U.compareVersions('boh', '1.4.0'), null);
    assert.equal(U.parseVersion('v2.0.0+build.5').major, 2);
    assert.equal(U.parseVersion('2.0'), null);
  });

  await test('changelog del progetto letto con sezioni', () => {
    const cl = U.parseChangelog(CHANGELOG);
    assert.equal(cl.length, 2);
    assert.equal(cl[0].version, '1.4.0');
    assert.equal(cl[0].date, '2026-10-17');
    assert.deepEqual(cl[0].items[1], { section: 'Corretto', text: 'Il pulsante +60 s non sparisce più' });
  });

  await test('release: versione uguale → aggiornata', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.4.0', fetchImpl: fakeFetch({ [`${API}/releases?per_page=15`]: { status: 200, body: [release('v1.4.0')] } }) });
    assert.equal(r.source, 'releases');
    assert.equal(r.status, 'uptodate');
  });

  await test('release: versione più recente con lo zip giusto', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.4.0', fetchImpl: fakeFetch({ [`${API}/releases?per_page=15`]: { status: 200, body: [release('v1.5.0'), release('v1.4.0')] } }) });
    assert.equal(r.status, 'available');
    assert.equal(r.latest.version, '1.5.0');
    assert.equal(r.latest.asset.name, 'Keep_Watching-1.5.0.zip');
    assert.deepEqual(r.latest.notes, ['Statistiche locali', 'Centro aggiornamenti']);
    assert.equal(r.history.length, 2);
  });

  await test('release: versione pubblicata più vecchia di quella installata', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.4.0', fetchImpl: fakeFetch({ [`${API}/releases?per_page=15`]: { status: 200, body: [release('v1.3.0')] } }) });
    assert.equal(r.status, 'ahead');
  });

  await test('release: la prerelease non viene proposta come aggiornamento, le bozze ignorate', async () => {
    const list = [release('v1.5.0-beta.1', { prerelease: true }), release('v9.0.0', { draft: true }), release('v1.4.0')];
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.4.0', fetchImpl: fakeFetch({ [`${API}/releases?per_page=15`]: { status: 200, body: list } }) });
    assert.equal(r.status, 'uptodate');
    assert.equal(r.prerelease.version, '1.5.0-beta.1');
    assert.equal(r.history.some((h) => h.version === '9.0.0'), false);
  });

  await test('release senza asset e senza note: niente download diretto, note segnalate assenti', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.4.0', fetchImpl: fakeFetch({ [`${API}/releases?per_page=15`]: { status: 200, body: [release('v1.5.0', { assets: [], body: '' })] } }) });
    assert.equal(r.status, 'available');
    assert.equal(r.latest.asset, null);
    assert.equal(r.latest.hasNotes, false);
    assert.match(r.latest.url, /releases\/tag\/v1.5.0$/);
  });

  await test('release con più zip: si sceglie quello della versione, altrimenti nessuno', () => {
    const rel = release('v1.5.0', { assets: [
      { name: 'Keep_Watching_GitHub.zip', browser_download_url: 'https://x/a.zip' },
      { name: 'Keep_Watching-1.5.0.zip', browser_download_url: 'https://x/b.zip' }] });
    assert.equal(U.pickAsset(rel).url, 'https://x/b.zip');
    const amb = release('v1.5.0', { assets: [
      { name: 'Keep_Watching_GitHub.zip', browser_download_url: 'https://x/a.zip' },
      { name: 'Keep_Watching-old.zip', browser_download_url: 'https://x/c.zip' }] });
    assert.equal(U.pickAsset(amb), null);
  });

  await test('nessuna release: si usa version.json, con zip verificato nel repository', async () => {
    const calls = [];
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.3.0', fetchImpl: fakeFetch(versionJsonRoutes(), calls) });
    assert.equal(r.source, 'version-json');
    assert.equal(r.status, 'available');
    assert.equal(r.latest.asset.url, `https://raw.githubusercontent.com/${REPO}/main/Keep_Watching-1.4.0.zip`);
    assert.equal(r.history[0].version, '1.4.0');
    assert.ok(calls.every((c) => c.init.credentials === 'omit'), 'nessun cookie inviato');
    assert.ok(calls.every((c) => !c.url.includes('?') || c.url.endsWith('per_page=15')), 'nessun dato locale nelle richieste');
  });

  await test('version.json che indica uno zip assente: nessun download inventato', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.3.0', fetchImpl: fakeFetch(versionJsonRoutes(VERSION_JSON, [LISTING[1]])) });
    assert.equal(r.status, 'available');
    assert.equal(r.latest.asset, null);
  });

  await test('version.json con zip di un\'altra versione o malformato', async () => {
    assert.equal(U.parseVersionJson({ ...VERSION_JSON, zip: 'Keep_Watching-1.3.0.zip' }).zip, null);
    assert.equal(U.parseVersionJson({ ...VERSION_JSON, zip: '../../evil.exe' }).zip, null);
    assert.equal(U.parseVersionJson('{rotto').ok, false);
    assert.equal(U.parseVersionJson({ version: 'nuova' }).ok, false);
  });

  await test('niente release né version.json: messaggio chiaro, nessun aggiornamento', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.4.0', fetchImpl: fakeFetch({
      [`${API}/releases?per_page=15`]: { status: 200, body: [] },
      [`${API}/contents/version.json`]: { status: 404, body: {} } }) });
    assert.equal(r.ok, false);
    assert.equal(r.errorKind, 'nothing');
  });

  await test('errore di rete', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.4.0', fetchImpl: fakeFetch({ [`${API}/releases?per_page=15`]: 'rete' }) });
    assert.equal(r.ok, false);
    assert.equal(r.errorKind, 'network');
  });

  await test('limite di richieste di GitHub: errore e blocco fino al reset', async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.4.0', fetchImpl: fakeFetch({ [`${API}/releases?per_page=15`]: { status: 403, body: {}, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } } }) });
    assert.equal(r.errorKind, 'ratelimit');
    assert.equal(r.rateLimitReset, reset * 1000);
    assert.equal(U.canCheck(r, Date.now() + 120000), false);
    assert.equal(U.canCheck(r, reset * 1000 + 1), true);
  });

  await test('repository privato o inesistente', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.4.0', fetchImpl: fakeFetch({ [`${API}/releases?per_page=15`]: { status: 404, body: {} } }) });
    assert.equal(r.errorKind, 'notfound');
  });

  await test('controlli ravvicinati e controllo automatico giornaliero', () => {
    const now = Date.now();
    assert.equal(U.canCheck(null, now), true);
    assert.equal(U.canCheck({ at: now - 30000 }, now), false);
    assert.equal(U.canCheck({ at: now - 61000 }, now), true);
    assert.equal(U.dueForAutoCheck({ at: now - 3600000 }, now), false);
    assert.equal(U.dueForAutoCheck({ at: now - 25 * 3600000 }, now), true);
  });
};
