/**
 * Keep_Watching — riconoscimento e verifica delle pagine del sito.
 *
 * Gira nella pagina principale (…/watch/<id>) e nell'iframe intermedio (…/iframe/<id>).
 * Non modifica nulla: dice se la pagina ha la struttura prevista e risponde a "Verifica tutto".
 *
 * Riconoscimento: il dominio del sito cambia spesso e non viene usato. Una pagina è
 * riconosciuta solo se, oltre al percorso, contiene la struttura attesa:
 *   - pagina principale: un iframe verso …/iframe/…;
 *   - iframe intermedio: un iframe del player su uno degli host di KW_PLAYER_HOSTS (hosts.js).
 * Se nella pagina c'è un player simile su un altro dominio (per esempio vixcloud.xyz) lo
 * si segnala per nome: è il caso tipico in cui l'estensione va aggiornata.
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

  const frames = () => [...document.querySelectorAll('iframe')];
  // src come proprietà: indirizzo completo anche se nell'HTML è relativo.
  const playerFrame = () => frames().find((f) => kwIsPlayerUrl(f.src || f.getAttribute('src'))) || null;
  const otherPlayerHost = () => {
    const f = frames().find((x) => kwLooksLikeOtherPlayer(x.src || x.getAttribute('src')));
    return f ? kwHostOf(f.src) : null;
  };
  const episodeFrame = () => frames().find((f) => {
    try { return new URL(f.src, location.href).pathname.includes('/iframe/'); } catch (e) { return false; }
  }) || null;
  // Solo gli host (mai indirizzi completi): bastano per capire dove sta il player.
  const frameHosts = () => [...new Set(frames().map((f) => kwHostOf(f.src)).filter(Boolean))].slice(0, 6);

  function report() {
    if (IS_TOP) {
      const ep = episodeFrame();
      return {
        frame: 'site-top',
        host: location.host,
        watchPage: location.pathname.includes('/watch/'),
        episodeFrame: Boolean(ep),
        // Alcune versioni del sito potrebbero mettere il player direttamente nella pagina.
        playerFrame: Boolean(playerFrame()),
        otherPlayer: otherPlayerHost(),
        path: location.pathname.slice(0, 80),
        frameHosts: frameHosts()
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
      playerHost: pf ? kwHostOf(pf.src) : null,
      otherPlayer: otherPlayerHost(),
      frameHosts: frameHosts(),
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
      const other = otherPlayerHost();
      const hosts = frameHosts();
      logEvent(other
        ? { cat: 'site', level: 'error', fn: 'Riconoscimento del sito', msg: `Player su un dominio non supportato: ${other}`,
            result: `Supportati: ${KW_PLAYER_HOSTS.join(', ')}. Serve aggiornare l'estensione` }
        : { cat: 'site', level: 'warn', fn: 'Riconoscimento del sito', msg: 'Pagina dell\'episodio senza un player supportato',
            result: hosts.length ? `Iframe presenti: ${hosts.join(', ')}` : 'Nessun iframe: pagina di errore o di manutenzione, oppure il sito ha cambiato struttura' });
      send({ type: 'kwHealth', site: { at: Date.now(), playerMissing: true, otherPlayer: other, frameHosts: hosts } });
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
