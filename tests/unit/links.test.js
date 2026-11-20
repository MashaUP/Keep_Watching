'use strict';
const { test } = require('node:test');
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const L = require('../../src/lib/links.js');

const res = (status, body) => ({ status, ok: status >= 200 && status < 300, text: async () => body });
const remote = (links, extra = {}) => JSON.stringify({ schemaVersion: 1, project: 'keep-watching', revision: 2, links, ...extra });

test('collegamenti di serie: i sette del formato comune, tutti attivi', () => {
  const links = L.resolve(null);
  assert.deepEqual(links.filter((l) => l.enabled).map((l) => l.id), ['github', 'discord', 'kofi', 'documentation', 'changelog', 'bugs', 'ideas']);
  assert.equal(L.get(links, 'discord').url, 'https://discord.gg/EPsbQCuAkx');
  assert.equal(L.get(links, 'kofi').url, 'https://ko-fi.com/mashaup');
  assert.equal(L.get(links, 'bugs').url, 'https://github.com/MashaUP/Keep_Watching/issues/new?template=bug.yml');
  assert.equal(L.get(links, 'ideas').url, 'https://github.com/MashaUP/Keep_Watching/issues/new?template=idea.yml');
  for (const l of links) assert.ok(l.label && l.description && L.ICONS.includes(l.icon), l.id);
  assert.deepEqual(L.NAV_IDS, ['github', 'discord', 'kofi', 'documentation']);
});

test('indirizzi: solo https sugli host consentiti, niente schemi pericolosi o credenziali', () => {
  for (const ok of ['https://discord.gg/abc', 'https://discord.com/invite/abc', 'https://github.com/x', 'https://mashaup.github.io/kw/', 'https://ko-fi.com/x'])
    assert.ok(L.validUrl(ok), ok);
  for (const bad of ['http://discord.gg/abc', 'javascript:alert(1)', 'data:text/html,x', 'https://evil.com/discord.gg', 'https://discord.gg.evil.com/',
    'https://user:pw@github.com/', 'https://github.com:8443/', '', null, 42, 'https://altro.github.io/', 'https://www.github.com/x', `https://github.com/${'a'.repeat(400)}`])
    assert.equal(L.validUrl(bad), null, String(bad));
});

test('host per collegamento: github, discord e kofi solo sul proprio host', () => {
  assert.equal(L.validUrl('https://ko-fi.com/x', 'discord'), null);
  assert.equal(L.validUrl('https://discord.gg/x', 'github'), null);
  assert.equal(L.validUrl('https://github.com/x', 'kofi'), null);
  assert.ok(L.validUrl('https://discord.com/invite/x', 'discord'));
  assert.ok(L.validUrl('https://mashaup.github.io/kw/', 'documentation'));
  const p = L.parseRemote(remote({ discord: { url: 'https://ko-fi.com/truffa' } }));
  assert.deepEqual(p.rejected, ['discord']);
  assert.equal(L.get(L.resolve(p.data), 'discord').url, 'https://discord.gg/EPsbQCuAkx');
});

test('configurazione remota: cambia Discord senza nuova versione', () => {
  const p = L.parseRemote(remote({ discord: { url: 'https://discord.gg/NUOVO', enabled: true, label: 'Discord' } }));
  assert.equal(p.ok, true);
  assert.equal(p.data.revision, 2);
  const links = L.resolve(p.data);
  assert.equal(L.get(links, 'discord').url, 'https://discord.gg/NUOVO');
  assert.equal(L.get(links, 'discord').source, 'remote');
  assert.equal(L.get(links, 'github').source, 'local');
});

test('configurazione remota: spegne, aggiunge un collegamento nuovo, ordina', () => {
  const p = L.parseRemote(remote({
    bugs: { enabled: false }, kofi: { enabled: false, order: 0 },
    wiki: { label: 'Wiki', url: 'https://mashaup.github.io/wiki', icon: 'i-book', order: 1 }, senzaurl: { label: 'X' },
    ideas: { url: 'https://github.com/MashaUP/Keep_Watching/issues/new?template=idea.yml', enabled: true, campoIgnoto: 1 }
  }));
  const links = L.resolve(p.data);
  assert.equal(L.get(links, 'bugs'), null);
  assert.equal(L.get(links, 'kofi'), null);
  assert.equal(L.get(links, 'wiki').icon, 'i-book');
  assert.ok(L.get(links, 'ideas'), 'campi sconosciuti ignorati, voce valida');
  assert.equal(links.some((l) => l.id === 'senzaurl'), false);
  assert.deepEqual(links.slice(0, 3).map((l) => l.id), ['kofi', 'github', 'wiki']);
});

test('configurazione remota non valida: rifiutata o ripulita voce per voce', () => {
  for (const bad of ['', 'non json', '[]', '{"schemaVersion":2,"links":{}}', '{"schemaVersion":1}', '{"schemaVersion":1,"links":[]}',
    '{"schema":1,"links":{}}', 'x'.repeat(30000)])
    assert.equal(L.parseRemote(bad).ok, false, bad.slice(0, 20));
  const p = L.parseRemote(remote({
    discord: { url: 'javascript:alert(1)' }, github: { enabled: 'sì' }, 'bug-report': { url: 'https://github.com' },
    kofi: { label: '<b>x</b>\u0000', icon: '<svg onload=1>' }
  }));
  assert.equal(p.ok, true);
  assert.deepEqual(p.rejected.sort(), ['bug-report', 'discord', 'github']);
  const links = L.resolve(p.data);
  assert.equal(L.get(links, 'discord').url, 'https://discord.gg/EPsbQCuAkx', 'indirizzo pericoloso ignorato: resta quello di serie');
  assert.equal(L.get(links, 'kofi').icon, 'i-cup', 'icona sconosciuta ignorata');
  assert.equal(L.get(links, 'kofi').label, '<b>x</b>', 'testo solo come testo (il menu usa textContent)');
});

test('lettura remota da raw: valida, file assente, errori, tempo scaduto', async () => {
  assert.equal(L.REMOTE_URL, 'https://raw.githubusercontent.com/MashaUP/Keep_Watching/main/links.json');
  const calls = [];
  const good = remote({ discord: { url: 'https://discord.gg/z' } });
  assert.equal((await L.fetchRemote(async (u, init) => { calls.push([u, init]); return res(200, good); })).ok, true);
  assert.equal(calls[0][0], L.REMOTE_URL);
  assert.equal(calls[0][1].credentials, 'omit');
  assert.equal(calls[0][1].cache, 'no-store');
  assert.equal((await L.fetchRemote(async () => res(404, ''))).missing, true);
  assert.match((await L.fetchRemote(async () => res(429, ''))).error, /429/);
  assert.match((await L.fetchRemote(async () => { throw new TypeError('x'); })).error, /rete/);
  assert.match((await L.fetchRemote(async () => res(200, '{rotto'))).error, /JSON/);
  const slow = (u, init) => new Promise((r, j) => init.signal.addEventListener('abort', () => { const e = new Error('a'); e.name = 'AbortError'; j(e); }));
  assert.match((await L.fetchRemote(slow, { timeoutMs: 50 })).error, /tempo scaduto/);
});

test('cache: valida salvata, file assente torna ai valori di serie, errore tiene quella vecchia', () => {
  const data = { schemaVersion: 1, links: { discord: { url: 'https://discord.gg/z' } } };
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

test('cache della 1.6.0 (chiavi vecchie): ignorata senza errori', () => {
  const old = { schema: 1, links: { 'bug-report': { url: 'https://github.com/MashaUP/Keep_Watching/issues/new', enabled: true }, discord: { url: 'https://discord.gg/EPsbQCuAkx', enabled: true } } };
  const links = L.resolve(old);
  assert.equal(links.some((l) => l.id === 'bug-report'), false);
  assert.ok(L.get(links, 'discord'));
});

test('links.json del repository: valido e uguale ai collegamenti di serie', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', '..', 'links.json'), 'utf8');
  const p = L.parseRemote(text);
  assert.equal(p.ok, true);
  assert.deepEqual(p.rejected, []);
  const r = L.resolve(p.data).map((l) => [l.id, l.url, l.enabled, l.label]);
  const local = L.resolve(null).map((l) => [l.id, l.url, l.enabled, l.label]);
  assert.deepEqual(r, local);
});
