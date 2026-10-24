'use strict';
const assert = require('assert/strict');
const H = require('../../src/lib/health.js');

module.exports = async () => {
  await test('stati: avvio, riproduzione, pausa, fine', () => {
    const seen = [];
    const m = H.createMachine('loading', (to, from, ev) => seen.push(`${from}>${to}:${ev}`));
    assert.equal(m.send('video-ready'), true);
    assert.equal(m.send('playing'), true);
    assert.equal(m.send('progress'), false, 'già in riproduzione: nessun cambio');
    m.send('pause');
    m.send('playing');
    m.send('ended');
    assert.deepEqual(seen, ['loading>ready:video-ready', 'ready>playing:playing', 'playing>paused:pause', 'paused>playing:playing', 'playing>ended:ended']);
    assert.equal(m.history.length, 5);
  });

  await test('stati: il buffering non è un blocco; il blocco si chiude solo con avanzamento o pausa', () => {
    const m = H.createMachine('playing');
    m.send('waiting');
    assert.equal(m.state, 'buffering');
    m.send('stall-detected');
    assert.equal(m.state, 'stalled');
    assert.equal(m.send('waiting'), false, 'altro buffering: resta bloccato');
    m.send('recovery-start');
    assert.equal(m.state, 'recovering');
    assert.equal(m.send('recovery-start'), false, 'un solo recupero alla volta');
    m.send('progress');
    assert.equal(m.state, 'playing');
    m.send('stall-detected');
    m.send('pause');
    assert.equal(m.state, 'paused', 'la pausa dell\'utente chiude il blocco');
  });

  await test('stati: durante il cambio episodio pause e buffering non contano', () => {
    const m = H.createMachine('playing');
    m.send('next-start');
    for (const ev of ['pause', 'waiting', 'progress', 'playing']) assert.equal(m.send(ev), false, ev);
    assert.equal(m.state, 'switching');
    m.send('next-failed');
    assert.equal(m.state, 'error');
    m.send('manual-needed');
    assert.equal(m.state, 'fatal');
  });

  await test('stati: player incompatibile finché non compare un video che suona', () => {
    const m = H.createMachine('loading');
    m.send('video-missing');
    assert.equal(m.state, 'unsupported');
    assert.equal(m.send('pause'), false);
    m.send('playing');
    assert.equal(m.state, 'playing');
    for (const s of Object.keys(H.STATES)) assert.ok(H.STATES[s].label && H.STATES[s].text, s);
  });

  await test('tentativi: limite, uno alla volta, attesa crescente e pausa dopo i fallimenti', () => {
    const r = H.createRetry({ max: 2, baseMs: 1000, factor: 2, jitter: 0, cooldownMs: 60000 });
    assert.equal(r.delay(), 1000);
    assert.equal(r.begin(0), true);
    assert.equal(r.begin(0), false, 'un tentativo già in corso');
    r.fail(0);
    assert.equal(r.delay(), 2000);
    assert.equal(r.begin(10), true);
    r.fail(10);
    assert.equal(r.canAttempt(20), false, 'tentativi esauriti');
    assert.equal(r.blockedUntil, 60010);
    r.reset();
    assert.equal(r.begin(30), true);
    r.succeed();
    assert.equal(r.attempts, 0);
    const j = H.createRetry({ baseMs: 1000, jitter: 0.2, random: () => 1 });
    assert.equal(j.delay(), 1200, 'casualità entro il 20%');
  });

  await test('avvio in background: pochi tentativi crescenti, entro la fase di avvio', () => {
    const d = H.BACKGROUND_PLAY_DELAYS;
    assert.ok(d.length >= 3 && d.length <= 8, 'tentativi limitati');
    assert.ok(d.every((x, i) => i === 0 || x >= d[i - 1]), 'attese crescenti');
    assert.ok(d.reduce((a, b) => a + b, 0) < 90000, 'tutti dentro i 90 secondi della fase di avvio');
  });

  await test('errori del video classificati per codice', () => {
    assert.equal(H.classifyMediaError(1).recoverable, false);
    assert.equal(H.classifyMediaError(2).kind, 'network');
    assert.equal(H.classifyMediaError(4).kind, 'source');
    assert.equal(H.classifyMediaError(undefined).kind, 'unknown');
  });

  await test('verifiche: riepilogo per esito ed esito complessivo', () => {
    const c = [H.check('a', 'A', 'ok', ''), H.check('b', 'B', 'check', ''), H.check('c', 'C', 'na', '', { detail: 'off' })];
    assert.deepEqual(H.summarize(c), { ok: 1, check: 1, na: 1, errors: 0, overall: 'partial' });
    c.push(H.check('d', 'D', 'na', '', { detail: 'error' }));
    assert.equal(H.summarize(c).overall, 'error');
    assert.equal(H.summarize([H.check('a', 'A', 'ok', '')]).overall, 'ok');
  });

  await test('cronologia: eventi ripuliti, niente token né indirizzi completi', () => {
    const e = H.cleanEvent({ msg: 'Errore su https://vixcloud.co/embed/1?token=abc&expires=9', cat: 'boh', level: 'grave', extra: 'x', fn: 'Ripresa' }, 5);
    assert.equal(e.msg, 'Errore su vixcloud.co/embed/1');
    assert.equal(e.cat, 'extension');
    assert.equal(e.level, 'info');
    assert.equal('extra' in e, false);
    assert.equal(H.cleanEvent({ msg: 'riprova token=xyz' }).msg, 'riprova token=…');
    assert.equal(H.cleanEvent({ msg: '' }), null);
    assert.equal(H.cleanEvent({ msg: 'x'.repeat(500) }).msg.length, 160);
  });

  await test('cronologia: eventi ripetuti raggruppati, limite di righe', () => {
    const log = H.emptyLog();
    for (let i = 0; i < 50; i++) H.addEvent(log, { cat: 'recovery', level: 'warn', msg: 'Video bloccato' }, 1000 + i * 1000);
    assert.equal(log.events.length, 1);
    assert.equal(log.events[0].count, 50);
    H.addEvent(log, { cat: 'recovery', level: 'warn', msg: 'Video bloccato' }, 1000 + 49 * 1000 + H.LOG_GROUP_MS + 1);
    assert.equal(log.events.length, 2, 'dopo 10 minuti una riga nuova');
    for (let i = 0; i < H.LOG_MAX + 20; i++) H.addEvent(log, { msg: `evento ${i}` }, 10 ** 7 + i);
    assert.equal(log.events.length, H.LOG_MAX);
    assert.equal(log.events[log.events.length - 1].msg, `evento ${H.LOG_MAX + 19}`, 'si eliminano i più vecchi');
  });

  await test('cronologia: dati rovinati ripartono vuoti, esportazione con date leggibili', () => {
    assert.deepEqual(H.validLog({ schema: 2 }), H.emptyLog());
    assert.deepEqual(H.validLog(null), H.emptyLog());
    const log = H.validLog({ schema: 1, events: [{ msg: 'ok', at: 0 }, { msg: 5 }, null] });
    assert.equal(log.events.length, 1);
    const j = H.logToJSON(log, 0, '1.5.0');
    assert.equal(j.schema, 'keep-watching-log');
    assert.equal(j.events[0].at, '1970-01-01T00:00:00.000Z');
  });
};
