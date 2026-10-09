/**
 * Keep_Watching — ricarica dell'episodio quando lo streaming si blocca.
 *
 * Gira nelle pagine del sito. Su richiesta del player (tramite il service worker)
 * l'iframe intermedio (…/it/iframe/<id>?episode_id=…) si ricarica con il parametro
 * minute=N, che il sito passa al player per partire da quel minuto. Il sito genera
 * così un token nuovo per il player: ricaricare direttamente l'iframe del player
 * non funziona, perché il suo token scade dopo pochi secondi (410 Gone).
 * Il secondo esatto viene poi ripristinato da player.js (chiave "resume").
 */
(() => {
  'use strict';

  if (!location.pathname.includes('/iframe/')) return;

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'kwReloadEpisode') return;
    const url = new URL(location.href);
    url.searchParams.set('minute', String(Math.max(0, Math.floor(msg.minute) || 0)));
    console.log('[Keep_Watching] Ricarico l\'episodio dal minuto', url.searchParams.get('minute'));
    location.replace(url.href);
  });
})();
