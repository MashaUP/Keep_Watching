'use strict';
const { test } = require('node:test');
const assert = require('assert/strict');
const U = require('../../src/lib/updates.js');

const REPO = 'MashaUP/Keep_Watching';
const RAW = `https://raw.githubusercontent.com/${REPO}/main`;

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

const CHANGELOG = '# Changelog\n\n## [1.4.0] - 2026-10-17\n\n### Aggiunto\n- Statistiche\n\n### Corretto\n- Il pulsante **+60 s** non sparisce più\n\n## [1.3.0] - 2026-10-09\n\n### Aggiunto\n- Salto intro\n';
const SHA = 'a'.repeat(64);
const VERSION_JSON = { version: '1.4.0', date: '2026-10-17', zip: 'Keep_Watching-1.4.0.zip', sha256: SHA, notes: ['Statistiche locali', 'Centro aggiornamenti'] };
const routes = (vj = VERSION_JSON, cl = { status: 200, body: CHANGELOG }) => ({
  [`${RAW}/version.json`]: { status: 200, body: vj },
  [`${RAW}/CHANGELOG.md`]: cl
});

(async () => {
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

  await test('version.json: versione uguale → aggiornata', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.4.0', fetchImpl: fakeFetch(routes()) });
    assert.equal(r.source, 'version-json');
    assert.equal(r.status, 'uptodate');
  });

  await test('version.json: versione più recente, zip da github.com/raw/HEAD con SHA-256', async () => {
    const calls = [];
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.3.0', fetchImpl: fakeFetch(routes(), calls) });
    assert.equal(r.status, 'available');
    assert.equal(r.latest.version, '1.4.0');
    assert.equal(r.latest.asset.url, `https://github.com/${REPO}/raw/HEAD/Keep_Watching-1.4.0.zip`);
    assert.equal(r.latest.asset.sha256, SHA);
    assert.deepEqual(r.latest.notes, ['Statistiche locali', 'Centro aggiornamenti']);
    assert.equal(r.history[0].version, '1.4.0');
    assert.equal(r.history.length, 2);
    assert.deepEqual(calls.map((c) => c.url), [`${RAW}/version.json`, `${RAW}/CHANGELOG.md`], 'solo raw.githubusercontent.com, niente API');
    assert.ok(calls.every((c) => c.init.credentials === 'omit' && c.init.cache === 'no-store'), 'nessun cookie, nessuna cache');
    assert.ok(calls.every((c) => !c.url.includes('?')), 'nessun dato locale nelle richieste');
  });

  await test('version.json: versione pubblicata più vecchia di quella installata', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.5.0', fetchImpl: fakeFetch(routes()) });
    assert.equal(r.status, 'ahead');
  });

  await test('version.json senza note: si usano quelle del CHANGELOG', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.3.0', fetchImpl: fakeFetch(routes({ ...VERSION_JSON, notes: [] })) });
    assert.deepEqual(r.latest.notes, ['Aggiunto: Statistiche', 'Corretto: Il pulsante +60 s non sparisce più']);
  });

  await test('CHANGELOG assente: il controllo riesce lo stesso, registro vuoto', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.3.0', fetchImpl: fakeFetch(routes(VERSION_JSON, { status: 404, body: '' })) });
    assert.equal(r.ok, true);
    assert.equal(r.status, 'available');
    assert.deepEqual(r.history, []);
  });

  await test('version.json senza zip valido: nessun download inventato', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.3.0', fetchImpl: fakeFetch(routes({ ...VERSION_JSON, zip: 'altro.zip' })) });
    assert.equal(r.status, 'available');
    assert.equal(r.latest.asset, null);
  });

  await test('version.json: SHA-256 e note validati', () => {
    assert.equal(U.parseVersionJson({ ...VERSION_JSON, sha256: 'xyz' }).sha256, null);
    assert.equal(U.parseVersionJson({ ...VERSION_JSON, sha256: SHA.toUpperCase() }).sha256, null);
    const long = U.parseVersionJson({ ...VERSION_JSON, notes: ['x'.repeat(400), 5, '', ...Array(20).fill('ok')] });
    assert.equal(long.notes[0].length, 300);
    assert.equal(long.notes.length, 12);
  });

  await test('version.json con zip di un\'altra versione o malformato', async () => {
    assert.equal(U.parseVersionJson({ ...VERSION_JSON, zip: 'Keep_Watching-1.3.0.zip' }).zip, null);
    assert.equal(U.parseVersionJson({ ...VERSION_JSON, zip: '../../evil.exe' }).zip, null);
    assert.equal(U.parseVersionJson('{rotto').ok, false);
    assert.equal(U.parseVersionJson({ version: 'nuova' }).ok, false);
  });

  await test('version.json assente (404): repository privato o file non pubblicato', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.4.0', fetchImpl: fakeFetch({ [`${RAW}/version.json`]: { status: 404, body: '404: Not Found' } }) });
    assert.equal(r.ok, false);
    assert.equal(r.errorKind, 'notfound');
    assert.match(r.error, /privato/);
  });

  await test('errore di rete', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.4.0', fetchImpl: fakeFetch({ [`${RAW}/version.json`]: 'rete' }) });
    assert.equal(r.ok, false);
    assert.equal(r.errorKind, 'network');
  });

  await test('limite di GitHub (429 con Retry-After): errore e blocco fino alla scadenza', async () => {
    const now = Date.now();
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.4.0', now, fetchImpl: fakeFetch({ [`${RAW}/version.json`]: { status: 429, body: '', headers: { 'retry-after': '600' } } }) });
    assert.equal(r.errorKind, 'ratelimit');
    assert.equal(r.rateLimitReset, now + 600000);
    assert.equal(U.canCheck(r, now + 120000), false);
    assert.equal(U.canCheck(r, now + 600001), true);
  });

  await test('403 senza Retry-After: limite, ma si può riprovare dopo un minuto', async () => {
    const now = Date.now();
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.4.0', now, fetchImpl: fakeFetch({ [`${RAW}/version.json`]: { status: 403, body: '' } }) });
    assert.equal(r.errorKind, 'ratelimit');
    assert.equal(r.rateLimitReset, undefined);
    assert.equal(U.canCheck(r, now + 61000), true);
  });

  await test('version.json non valido', async () => {
    const r = await U.checkForUpdates({ repo: REPO, installed: '1.4.0', fetchImpl: fakeFetch({ [`${RAW}/version.json`]: { status: 200, body: '{rotto' } }) });
    assert.equal(r.errorKind, 'invalid');
  });

  await test('controlli ravvicinati e controllo automatico giornaliero', () => {
    const now = Date.now();
    assert.equal(U.canCheck(null, now), true);
    assert.equal(U.canCheck({ at: now - 30000 }, now), false);
    assert.equal(U.canCheck({ at: now - 61000 }, now), true);
    assert.equal(U.dueForAutoCheck({ at: now - 3600000 }, now), false);
    assert.equal(U.dueForAutoCheck({ at: now - 25 * 3600000 }, now), true);
  });
})();
