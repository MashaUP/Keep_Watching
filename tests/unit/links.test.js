'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const L = require('../../src/lib/links.js');

const res = (status, body) => ({ status, ok: status >= 200 && status < 300, text: async () => body });

module.exports = async () => {
  await test('collegamenti di serie: GitHub, Discord, Ko-fi e guida attivi; segnalazioni predisposte ma spente', () => {
    const links = L.resolve(null);
    const on = links.filter((l) => l.enabled).map((l) => l.id);
    assert.deepEqual(on, ['github', 'discord', 'kofi', 'documentation']);
    assert.equal(L.get(links, 'discord').url, 'https://discord.gg/EPsbQCuAkx');
    assert.equal(L.get(links, 'kofi').url, 'https://ko-fi.com/mashaup');
    assert.equal(L.get(links, 'bug-report'), null, 'spento: non restituito');
    for (const l of links) assert.ok(l.label && l.description && L.ICONS.includes(l.icon), l.id);
  });

  await test('indirizzi: solo https sui domini dell\'elenco, niente schemi pericolosi o credenziali', () => {
    for (const ok of ['https://discord.gg/abc', 'https://discord.com/invite/abc', 'https://www.github.com/x', 'https://mashaup.github.io/kw/'])
      assert.ok(L.validUrl(ok), ok);
    for (const bad of ['http://discord.gg/abc', 'javascript:alert(1)', 'data:text/html,x', 'https://evil.com/discord.gg', 'https://discord.gg.evil.com/',
      'https://user:pw@github.com/', 'https://github.com:8443/', '', null, 42, 'https://.github.io/', `https://github.com/${'a'.repeat(400)}`])
      assert.equal(L.validUrl(bad), null, String(bad));
  });

  await test('configurazione remota: cambia Discord senza nuova versione', () => {
    const p = L.parseRemote(JSON.stringify({ schema: 1, links: { discord: { url: 'https://discord.gg/NUOVO', enabled: true } } }));
    assert.equal(p.ok, true);
    const links = L.resolve(p.data);
    assert.equal(L.get(links, 'discord').url, 'https://discord.gg/NUOVO');
    assert.equal(L.get(links, 'discord').source, 'remote');
    assert.equal(L.get(links, 'github').source, 'local');
  });

  await test('configurazione remota: accende o spegne, aggiunge un collegamento nuovo con label e url', () => {
    const p = L.parseRemote(JSON.stringify({ schema: 1, links: {
      'bug-report': { enabled: true }, kofi: { enabled: false },
      wiki: { label: 'Wiki', url: 'https://mashaup.github.io/wiki', icon: 'i-book' }, senzaurl: { label: 'X' }
    } }));
    const links = L.resolve(p.data);
    assert.ok(L.get(links, 'bug-report'));
    assert.equal(L.get(links, 'kofi'), null);
    assert.equal(L.get(links, 'wiki').icon, 'i-book');
    assert.equal(links.some((l) => l.id === 'senzaurl'), false);
  });

  await test('configurazione remota non valida: rifiutata o ripulita, nessun codice', () => {
    for (const bad of ['', 'non json', '[]', '{"schema":2,"links":{}}', '{"schema":1}', '{"schema":1,"links":[]}', 'x'.repeat(30000)])
      assert.equal(L.parseRemote(bad).ok, false, bad.slice(0, 20));
    const p = L.parseRemote(JSON.stringify({ schema: 1, links: {
      discord: { url: 'javascript:alert(1)' }, github: { enabled: 'sì' }, 'Bad Id': { url: 'https://github.com' },
      kofi: { label: '<b>x</b>\u0000', icon: '<svg onload=1>' }
    } }));
    assert.equal(p.ok, true);
    assert.deepEqual(p.rejected.sort(), ['Bad Id', 'discord', 'github']);
    const links = L.resolve(p.data);
    assert.equal(L.get(links, 'discord').url, 'https://discord.gg/EPsbQCuAkx', 'indirizzo pericoloso ignorato: resta quello di serie');
    assert.equal(L.get(links, 'kofi').icon, 'i-cup', 'icona sconosciuta ignorata');
    assert.equal(L.get(links, 'kofi').label, '<b>x</b>', 'testo solo come testo (il menu usa textContent)');
  });

  await test('lettura remota: valida, file assente, errori, tempo scaduto', async () => {
    const good = JSON.stringify({ schema: 1, links: { discord: { url: 'https://discord.gg/z' } } });
    assert.equal((await L.fetchRemote(async () => res(200, good))).ok, true);
    assert.equal((await L.fetchRemote(async () => res(404, ''))).missing, true);
    assert.match((await L.fetchRemote(async () => res(403, ''))).error, /403/);
    assert.match((await L.fetchRemote(async () => { throw new TypeError('x'); })).error, /rete/);
    assert.match((await L.fetchRemote(async () => res(200, '{rotto'))).error, /JSON/);
    const slow = (u, init) => new Promise((r, j) => init.signal.addEventListener('abort', () => { const e = new Error('a'); e.name = 'AbortError'; j(e); }));
    assert.match((await L.fetchRemote(slow, { timeoutMs: 50 })).error, /tempo scaduto/);
  });

  await test('cache: valida salvata, file assente torna ai valori di serie, errore tiene quella vecchia', () => {
    const data = { schema: 1, links: { discord: { url: 'https://discord.gg/z' } } };
    const c1 = L.nextCache(null, { ok: true, data }, 1000);
    assert.equal(c1.data, data);
    const c2 = L.nextCache(c1, { ok: false, error: 'rete non disponibile' }, 5000);
    assert.equal(c2.data, data, 'errore: si usa ancora la cache');
    assert.equal(c2.lastError, 'rete non disponibile');
    assert.equal(L.due(c2, 5000 + 1000), false, 'nessun nuovo tentativo subito dopo un errore');
    assert.equal(L.due(c2, 5000 + L.REMOTE_MAX_AGE_MS + 1), true);
    const c3 = L.nextCache(c2, { ok: false, missing: true }, 9000);
    assert.equal(c3.data, null);
  });

  await test('links.json del repository: valido e uguale ai collegamenti di serie', () => {
    const text = fs.readFileSync(path.join(__dirname, '..', '..', 'links.json'), 'utf8');
    const p = L.parseRemote(text);
    assert.equal(p.ok, true);
    assert.deepEqual(p.rejected, []);
    const remote = L.resolve(p.data).map((l) => [l.id, l.url, l.enabled]);
    const local = L.resolve(null).map((l) => [l.id, l.url, l.enabled]);
    assert.deepEqual(remote, local);
  });
};
