'use strict';
const assert = require('assert/strict');
const D = require('../../src/defaults.js');

module.exports = async () => {
  await test('sanitize: chiavi mancanti e tipi sbagliati tornano ai valori di serie', () => {
    const s = D.kwSanitize({ autoNext: 'sì', quickSkip: 50, uiOpacity: 300, countdown: 5, popups: { limit: false, x: true } });
    assert.equal(s.autoNext, true);
    assert.equal(s.quickSkip, 60);
    assert.equal(s.uiOpacity, 82);
    assert.equal(s.countdown, 5);
    assert.equal(s.popups.limit, false);
    assert.equal(s.popups.countdown, true);
    assert.equal('x' in s.popups, false);
  });

  await test('sanitize: valori validi restano, input non oggetto non rompe', () => {
    assert.equal(D.kwSanitize({ quickSkip: 90 }).quickSkip, 90);
    assert.equal(D.kwSanitize({ skipCredits: 210 }).skipCredits, 210);
    assert.equal(D.kwSanitize({ skipCredits: 99999 }).skipCredits, 0);
    assert.deepEqual(D.kwSanitize(null), D.kwSanitize({}));
  });

  await test('popup: il controllo globale nasconde tutto ma non cambia le preferenze singole', () => {
    const s = D.kwSanitize({ popups: { confirm: false } });
    assert.equal(D.kwPopupVisible(s, 'countdown'), true);
    assert.equal(D.kwPopupVisible(s, 'confirm'), false);
    const hidden = { ...s, popupsHidden: true };
    assert.equal(D.kwPopupVisible(hidden, 'countdown'), false);
    assert.equal(hidden.popups.countdown, true, 'la preferenza singola resta memorizzata');
    assert.equal(D.kwPopupVisible({ ...hidden, popupsHidden: false }, 'countdown'), true, 'ripristino');
  });

  await test('profili: ognuno applica solo le sue chiavi, mai timer, limite o aspetto', () => {
    const cur = D.kwSanitize({ stopAfter: 3, uiSize: 'large', popups: { info: false } });
    for (const id of Object.keys(D.KW_PROFILES)) {
      const ch = D.kwProfileChanges(id, cur);
      assert.equal(ch.profile, id);
      for (const k of ['stopAfter', 'sleep', 'uiSize', 'uiOpacity', 'stats', 'quickSkip', 'enabled']) assert.equal(k in ch, false, `${id} tocca ${k}`);
    }
    assert.deepEqual(D.kwProfileChanges('manual', cur), { profile: 'manual', autoNext: false });
    assert.equal(D.kwProfileChanges('nessuno', cur), null);
  });

  await test('profili: personalizzazione rilevata solo sulle chiavi del profilo', () => {
    const s = { ...D.kwSanitize({}), ...D.kwProfileChanges('night', D.kwSanitize({})) };
    assert.deepEqual(D.kwProfileDiff('night', s), []);
    s.countdown = 20;
    s.uiSize = 'large';
    assert.deepEqual(D.kwProfileDiff('night', s), ['countdown']);
    s.popups = { ...s.popups, info: true };
    assert.deepEqual(D.kwProfileDiff('night', s), ['countdown', 'popups.info']);
    assert.deepEqual(D.kwProfileDiff('manual', { ...s, autoNext: false }), []);
  });

  await test('profilo Maratona rispetta il limite di episodi', () => {
    const ch = D.kwProfileChanges('marathon', D.kwSanitize({ stopAfter: 5 }));
    assert.equal('stopAfter' in ch, false);
    assert.equal(ch.autoNext, true);
  });

  await test('scorciatoie: normalizzazione e stati (assegnata, mancante, conflitto)', () => {
    assert.equal(D.kwNormalizeShortcut('Maiusc+Alt+k'), 'Alt+Shift+K');
    assert.equal(D.kwNormalizeShortcut('Alt+Shift+Right Arrow'), 'Alt+Shift+Right');
    assert.match(D.kwShortcutStates([{ name: 'skip-intro', shortcut: 'Alt+Left Arrow' }])[2].conflict, /Indietro/);
    assert.equal(D.kwNormalizeShortcut('⌥⇧K'.split('').join('+')), 'Alt+Shift+K');
    const st = D.kwShortcutStates([
      { name: 'toggle-enabled', shortcut: 'Alt+Shift+K' },
      { name: 'quick-skip', shortcut: '' },
      { name: 'skip-intro', shortcut: 'Alt+Left' },
      { name: 'mark-intro', shortcut: 'Alt+Shift+K' }
    ]);
    const by = Object.fromEntries(st.map((x) => [x.name, x]));
    assert.equal(by['toggle-enabled'].state, 'assigned');
    assert.equal(by['toggle-enabled'].conflict, null);
    assert.equal(by['quick-skip'].state, 'missing');
    assert.match(by['skip-intro'].conflict, /Indietro/);
    assert.match(by['mark-intro'].conflict, /stessa/);
    assert.equal(by['mark-credits'].state, 'unassigned');
  });

  await test('Alt+Shift+K resta la scorciatoia di attivazione', () => {
    const m = require('../../manifest.json');
    assert.equal(m.commands['toggle-enabled'].suggested_key.default, 'Alt+Shift+K');
    for (const c of D.KW_COMMANDS) assert.ok(m.commands[c.name], `manca il comando ${c.name} nel manifest`);
    const withKeys = Object.values(m.commands).filter((c) => c.suggested_key);
    assert.ok(withKeys.length <= 4, 'Chrome accetta al massimo 4 combinazioni suggerite');
  });

  await test('formati di tempo', () => {
    assert.equal(D.kwFormatTime(92), '1:32');
    assert.equal(D.kwFormatTime(3723), '1:02:03');
    assert.equal(D.kwFormatDuration(45), '45 s');
    assert.equal(D.kwFormatDuration(7500), '2 h 05 min');
  });
};
