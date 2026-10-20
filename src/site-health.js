/**
 * Keep_Watching — riconoscimento e verifica delle pagine del sito.
 *
 * Gira nella pagina principale (…/watch/<id>) e nell'iframe intermedio (…/iframe/<id>).
 * Non modifica nulla: dice se la pagina ha la struttura prevista e risponde a "Verifica tutto".
 *
 * Riconoscimento: il dominio del sito cambia spesso e non viene usato. Una pagina è
 * riconosciuta solo se, oltre al percorso, contiene la struttura attesa:
 *   - pagina principale: un iframe verso …/iframe/…;
 *   - iframe intermedio: un iframe del player su vixcloud.co (unico host del player supportato).
 * Un sito qualsiasi con /watch/ nel percorso ma senza quel player non viene trattato come
 * StreamingCommunity: autoplay-permission.js tocca solo iframe di vixcloud.
 */
(() => {
  'use strict';

  const IS_TOP = window === window.top;
  const IS_MID = !IS_TOP && location.pathname.includes('/iframe/');
  // Attesa prima di dire che nella pagina dell'episodio non c'è il player.
  const PLAYER_WAIT_MS = 15 * 1000;

  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});
  const logEvent = (ev) => send({ type: 'kwEvent', ev: { at: Date.now(), ...ev } });

  const playerFrame = () => [...document.querySelectorAll('iframe')]
    .find((f) => /^(https?:)?\/\/([a-z0-9-]+\.)*vixcloud\.co(:\d+)?\//i.test(f.getAttribute('src') || '')) || null;
  const episodeFrame = () => document.querySelector('iframe[src*="/iframe/"]');

  function report() {
    if (IS_TOP) {
      const ep = episodeFrame();
      return {
        frame: 'site-top',
        host: location.host,
        watchPage: location.pathname.includes('/watch/'),
        episodeFrame: Boolean(ep),
        // Alcune versioni del sito potrebbero mettere il player direttamente nella pagina.
        playerFrame: Boolean(playerFrame())
      };
    }
    const pf = playerFrame();
    const src = pf ? pf.getAttribute('src') || '' : '';
    const allow = pf ? (pf.getAttribute('allow') || '') : '';
    return {
      frame: 'site-iframe',
      playerFrame: Boolean(pf),
      patched: src.includes('kw_autoplay=1'),
      allowAutoplay: /(^|;)\s*autoplay/.test(allow),
      readyState: document.readyState
    };
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'kwHealthCheck') send({ type: 'kwHealthReport', reqId: msg.reqId, report: report() });
  });

  // Pagina dell'episodio senza player dopo un'attesa ragionevole: pagina di errore o di
  // manutenzione, oppure il sito ha cambiato struttura. Un solo evento per pagina.
  if (IS_MID) {
    setTimeout(() => {
      if (playerFrame()) return;
      logEvent({ cat: 'site', level: 'warn', fn: 'Riconoscimento del sito', msg: 'Pagina dell\'episodio senza il player vixcloud',
        result: 'Pagina di errore o di manutenzione, oppure il sito ha cambiato struttura' });
      send({ type: 'kwHealth', site: { at: Date.now(), playerMissing: true } });
    }, PLAYER_WAIT_MS);
  }

  // Uscita dalla pagina principale (ricarica, altro sito): lo stato della scheda riparte da zero.
  if (IS_TOP) window.addEventListener('pagehide', () => send({ type: 'kwHealth', reset: true }));

  // Pagina principale riconosciuta (una volta per caricamento: tra un episodio e l'altro
  // la pagina principale non si ricarica).
  if (IS_TOP && location.pathname.includes('/watch/')) {
    const announce = () => {
      const ok = Boolean(episodeFrame() || playerFrame());
      send({ type: 'kwHealth', site: { at: Date.now(), host: location.host, recognized: ok } });
      logEvent(ok
        ? { cat: 'site', fn: 'Riconoscimento del sito', msg: `Pagina dell'episodio riconosciuta su ${location.host}` }
        : { cat: 'site', level: 'warn', fn: 'Riconoscimento del sito', msg: `Pagina /watch/ senza l'iframe dell'episodio su ${location.host}`,
            result: 'Struttura diversa da quella prevista: le funzioni automatiche non sono disponibili' });
    };
    if (document.readyState === 'complete') setTimeout(announce, 2000);
    else window.addEventListener('load', () => setTimeout(announce, 2000), { once: true });
  }
})();
