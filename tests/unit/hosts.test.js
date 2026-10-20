'use strict';
const assert = require('assert/strict');
const K = require('../../src/hosts.js');

module.exports = async () => {
  await test('host del player: vixcloud.co e vixcloud.cc, con sottodomini, porte e indirizzi senza protocollo', () => {
    for (const u of ['https://vixcloud.co/embed/1?token=a', 'https://vixcloud.cc/embed/784302', 'http://vixcloud.cc:8000/embed/1',
      '//vixcloud.cc/embed/2', 'https://www.vixcloud.cc/embed/3']) assert.equal(K.kwIsPlayerUrl(u, 'https://streamingunity.fun/it/iframe/1'), true, u);
  });

  await test('host del player: niente parole nell\'indirizzo, niente domini simili', () => {
    for (const u of ['https://evil.com/?vixcloud.cc/', 'https://vixcloud.cc.evil.com/embed/1', 'https://notvixcloud.cc/embed/1',
      'javascript:alert(1)', '', null, 'https://vixcloud.xyz/embed/1']) assert.equal(K.kwIsPlayerUrl(u, 'https://x.it/'), false, String(u));
  });

  await test('player su un dominio non ancora supportato: riconosciuto solo per la diagnosi', () => {
    assert.equal(K.kwLooksLikeOtherPlayer('https://vixcloud.xyz/embed/1', 'https://x.it/'), true);
    assert.equal(K.kwLooksLikeOtherPlayer('https://cdn.vixcloud.io/embed/1', 'https://x.it/'), true);
    assert.equal(K.kwLooksLikeOtherPlayer('https://vixcloud.cc/embed/1', 'https://x.it/'), false, 'già supportato');
    assert.equal(K.kwLooksLikeOtherPlayer('https://youtube.com/embed/1', 'https://x.it/'), false);
    assert.equal(K.kwHostOf('/it/iframe/1', 'https://streamingunity.fun/it/watch/1'), 'streamingunity.fun');
  });
};
