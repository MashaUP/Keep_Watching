'use strict';
const assert = require('assert/strict');
const S = require('../../src/lib/stats.js');

const at = (y, mo, d, h = 12, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();

module.exports = async () => {
  await test('tempo di visione: somma per giorno e una sola sessione per visione continua', () => {
    const st = S.emptyStats();
    let t = at(2026, 10, 17, 21, 0);
    for (let i = 0; i < 8; i++) { t += 15000; S.addPlay(st, { seconds: 15, at: t }); }
    const day = st.days['2026-10-17'];
    assert.equal(Math.round(day.play), 120);
    assert.equal(day.sessions, 1);
    assert.equal(Math.round(st.session.play), 120);
  });

  await test('sessione: pausa breve continua, pausa oltre 30 minuti apre una nuova sessione', () => {
    const st = S.emptyStats();
    S.addPlay(st, { seconds: 60, at: at(2026, 10, 17, 20, 0) });
    S.addPlay(st, { seconds: 60, at: at(2026, 10, 17, 20, 20) });
    assert.equal(st.days['2026-10-17'].sessions, 1);
    S.addPlay(st, { seconds: 60, at: at(2026, 10, 17, 21, 0) });
    assert.equal(st.days['2026-10-17'].sessions, 2);
    assert.equal(st.sessions.length, 1);
    assert.equal(st.sessions[0].play, 120);
  });

  await test('pezzo a cavallo della mezzanotte diviso tra i due giorni; sessione contata il giorno di inizio', () => {
    const st = S.emptyStats();
    S.addPlay(st, { seconds: 60, at: at(2026, 10, 18, 0, 0, 20) });
    assert.equal(Math.round(st.days['2026-10-17'].play), 40);
    assert.equal(Math.round(st.days['2026-10-18'].play), 20);
    assert.equal(st.days['2026-10-17'].sessions, 1);
    assert.equal(st.days['2026-10-18'].sessions, 0);
  });

  await test('valori non validi ignorati; pezzi troppo lunghi limitati e segnati come stimati', () => {
    const st = S.emptyStats();
    S.addPlay(st, { seconds: -5, at: at(2026, 10, 17) });
    S.addPlay(st, { seconds: NaN, at: at(2026, 10, 17) });
    assert.equal(Object.keys(st.days).length, 0);
    S.addPlay(st, { seconds: 600, at: at(2026, 10, 17) });
    assert.equal(st.days['2026-10-17'].play, S.KW_MAX_CHUNK_S);
    assert.equal(st.days['2026-10-17'].est, true);
  });

  await test('episodi completati: lo stesso episodio non conta due volte', () => {
    const st = S.emptyStats();
    const k = S.episodeKey('Brothers|S1:E1 On the road');
    assert.equal(S.addEvent(st, { type: 'completed', key: k, at: at(2026, 10, 17, 21) }), true);
    assert.equal(S.addEvent(st, { type: 'completed', key: k, at: at(2026, 10, 17, 21, 5) }), false);
    assert.equal(S.addEvent(st, { type: 'completed', key: S.episodeKey('Brothers|S1:E2'), at: at(2026, 10, 17, 22) }), true);
    assert.equal(st.days['2026-10-17'].completed, 2);
    assert.equal(S.addEvent(st, { type: 'completed', key: k, at: at(2026, 10, 18, 9) }), true, 'dopo 6 ore si può rivedere');
  });

  await test('intro e titoli: contatori, annullamento e tipi sconosciuti', () => {
    const st = S.emptyStats();
    const t = at(2026, 10, 17);
    S.addEvent(st, { type: 'intro', at: t });
    S.addEvent(st, { type: 'intro', at: t });
    S.addEvent(st, { type: 'introUndo', at: t });
    S.addEvent(st, { type: 'credits', at: t });
    assert.equal(S.addEvent(st, { type: 'boh', at: t }), false);
    assert.deepEqual([st.days['2026-10-17'].intro, st.days['2026-10-17'].credits], [1, 1]);
    const st2 = S.emptyStats();
    assert.equal(S.addEvent(st2, { type: 'introUndo', at: t }), false, 'mai sotto zero');
  });

  await test('riepiloghi: oggi, 7 e 30 giorni; media delle sessioni; assenza di dati', () => {
    const now = at(2026, 10, 17, 23);
    const st = S.emptyStats();
    S.addPlay(st, { seconds: 100, at: at(2026, 10, 17, 20) });
    S.addPlay(st, { seconds: 100, at: at(2026, 10, 12, 20) });
    S.addPlay(st, { seconds: 100, at: at(2026, 9, 25, 20) });
    S.addPlay(st, { seconds: 100, at: at(2026, 8, 1, 20) });
    const today = S.summarize(st, 'today', now);
    const week = S.summarize(st, 7, now);
    const month = S.summarize(st, 30, now);
    assert.equal(today.days.length, 1);
    assert.equal(Math.round(today.play), 100);
    assert.equal(week.days.length, 7);
    assert.equal(Math.round(week.play), 200);
    assert.equal(month.days.length, 30);
    assert.equal(Math.round(month.play), 300);
    assert.equal(month.sessions, 3);
    assert.equal(Math.round(month.avgSession), 100);
    const empty = S.summarize(S.emptyStats(), 7, now);
    assert.equal(empty.hasData, false);
    assert.equal(empty.avgSession, 0);
  });

  await test('giorni locali: cambio dell\'ora legale e fine mese', () => {
    const r = S.dayRange(at(2026, 10, 24), at(2026, 10, 27));
    assert.deepEqual(r, ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
    const m = S.lastDays(3, at(2026, 3, 1, 10));
    assert.deepEqual(m, ['2026-02-27', '2026-02-28', '2026-03-01']);
  });

  await test('dati rovinati: riparati voce per voce o azzerati', () => {
    const v = S.validateStats({ schema: 1, days: { '2026-10-17': { play: 50, sessions: 'x' }, 'boh': {}, '2026-10-18': null }, sessions: [{ start: 1, play: 2 }, { start: 'x' }], recent: 'no' });
    assert.equal(v.repaired, true);
    assert.deepEqual(Object.keys(v.stats.days), ['2026-10-17']);
    assert.equal(v.stats.days['2026-10-17'].sessions, 0);
    assert.equal(v.stats.sessions.length, 1);
    assert.equal(S.validateStats('rotto').repaired, true);
    assert.deepEqual(S.validateStats(undefined).stats, S.emptyStats());
    assert.equal(S.validateStats(undefined).repaired, false);
  });

  await test('limite di crescita: giorni oltre 400 e sessioni vecchie eliminati', () => {
    const st = S.emptyStats();
    const now = at(2026, 10, 17);
    st.days['2024-01-01'] = { play: 10, sessions: 1, completed: 0, intro: 0, credits: 0, est: false };
    st.days['2026-10-16'] = { play: 10, sessions: 1, completed: 0, intro: 0, credits: 0, est: false };
    st.sessions.push({ start: at(2024, 1, 1), play: 10 });
    S.prune(st, now);
    assert.deepEqual(Object.keys(st.days), ['2026-10-16']);
    assert.equal(st.sessions.length, 0);
  });

  await test('CSV: intestazione, BOM, separatore ; e virgolette', () => {
    const st = S.emptyStats();
    S.addPlay(st, { seconds: 3725, at: at(2026, 10, 17, 22) });
    const csv = S.toCSV(st);
    assert.ok(csv.startsWith('﻿data;tempo_visione_secondi;'));
    const rows = csv.trim().split('\r\n');
    assert.equal(rows.length, 2);
    assert.match(rows[1], /^2026-10-17;\d+;\d+:\d{2}:\d{2};1;0;0;0;(sì|no)$/);
    assert.equal(S.csvField('a;b'), '"a;b"');
    assert.equal(S.csvField('di "Brothers"'), '"di ""Brothers"""');
    assert.equal(S.csvField('riga\nnuova'), '"riga\nnuova"');
    assert.equal(S.csvField('Città'), 'Città');
    assert.equal(S.toCSV(S.emptyStats()), '﻿' + S.CSV_COLUMNS.join(';') + '\r\n', 'file vuoto: solo intestazione');
  });

  await test('JSON: schema, periodo, totali, niente titoli', () => {
    const st = S.emptyStats();
    S.addPlay(st, { seconds: 100, at: at(2026, 10, 16, 22) });
    S.addEvent(st, { type: 'completed', key: S.episodeKey('Segreto|S1:E1'), at: at(2026, 10, 16, 22) });
    S.addPlay(st, { seconds: 100, at: at(2026, 10, 17, 22), estimated: true });
    const j = S.toJSON(st, at(2026, 10, 17, 23), '1.4.0');
    assert.equal(j.schema, 'keep-watching-stats');
    assert.equal(j.version, 1);
    assert.deepEqual(j.period, { from: '2026-10-16', to: '2026-10-17' });
    assert.equal(j.totals.play, 200);
    assert.equal(j.totals.completed, 1);
    assert.equal(j.days[1].estimated, true);
    assert.equal(JSON.stringify(j).includes('Segreto'), false);
    assert.equal(S.toJSON(S.emptyStats()).period, null);
  });

  await test('importazione: file valido, unione idempotente, sostituzione', () => {
    const st = S.emptyStats();
    S.addPlay(st, { seconds: 100, at: at(2026, 10, 16, 22) });
    const exported = JSON.stringify(S.toJSON(st));
    const parsed = S.parseImport(exported);
    assert.equal(parsed.ok, true);
    const once = S.mergeImport(st, parsed, 'merge');
    assert.equal(once.added, 0);
    assert.equal(once.updated, 0);
    assert.equal(Math.round(once.stats.days['2026-10-16'].play), 100, 'reimportare non raddoppia');
    const other = S.parseImport({ schema: 'keep-watching-stats', version: 1, days: [{ date: '2026-10-10', play: 50, sessions: 1 }, { date: '2026-10-16', play: 300 }] });
    const merged = S.mergeImport(st, other, 'merge');
    assert.equal(merged.added, 1);
    assert.equal(merged.updated, 1);
    assert.equal(merged.stats.days['2026-10-16'].play, 300);
    assert.equal(Math.round(st.days['2026-10-16'].play), 100, 'lo storico originale non viene toccato');
    const replaced = S.mergeImport(st, other, 'replace');
    assert.deepEqual(Object.keys(replaced.stats.days).sort(), ['2026-10-10', '2026-10-16']);
  });

  await test('importazione: file malformati rifiutati', () => {
    const base = { schema: 'keep-watching-stats', version: 1 };
    const bad = [
      ['non json', '{'],
      ['altro file', { schema: 'altro', version: 1, days: [] }],
      ['versione futura', { ...base, version: 9, days: [] }],
      ['data sbagliata', { ...base, days: [{ date: '2026-13-45', play: 1 }] }],
      ['numero negativo', { ...base, days: [{ date: '2026-10-10', play: -1 }] }],
      ['fuori limite', { ...base, days: [{ date: '2026-10-10', play: 90000 }] }],
      ['testo al posto di numero', { ...base, days: [{ date: '2026-10-10', sessions: '3' }] }],
      ['decimale nei contatori', { ...base, days: [{ date: '2026-10-10', completed: 1.5 }] }],
      ['giorno doppio', { ...base, days: [{ date: '2026-10-10' }, { date: '2026-10-10' }] }],
      ['sessione rotta', { ...base, days: [], sessions: [{ start: 'ieri', play: 1 }] }]
    ];
    for (const [nome, file] of bad) assert.equal(S.parseImport(typeof file === 'string' ? file : JSON.stringify(file)).ok, false, nome);
  });
};
