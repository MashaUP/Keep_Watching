/**
 * Keep_Watching — permesso di autoplay per il player.
 *
 * Gira nelle pagine del sito (…/it/iframe/<id> e …/it/watch/<id>).
 *
 * Problema: l'iframe del player (vixcloud.co/embed/…) è scritto nell'HTML della pagina
 * …/it/iframe/<id> senza allow="autoplay". Senza quel permesso Chrome non considera il
 * click dell'utente sulla pagina principale e blocca l'avvio con audio del nuovo episodio.
 * Il browser avvia il caricamento dell'iframe mentre legge l'HTML, prima che qualsiasi
 * script possa aggiungere il permesso, e il permesso vale solo per i caricamenti successivi.
 *
 * Soluzione in due passi:
 *   1. rules.json blocca nel browser il caricamento del player se l'URL non contiene
 *      il marcatore kw_autoplay=1 (la richiesta non parte: il token dell'URL resta valido);
 *   2. questo script aggiunge allow="autoplay" e reimposta l'URL con il marcatore.
 *      Il nuovo caricamento parte con il permesso già presente.
 *
 * ATTENZIONE: se questo script smette di girare (il sito cambia percorso), la regola
 * di blocco resta attiva e il player non si carica più. Vedi docs/MANUTENZIONE.md.
 */
(() => {
  'use strict';

  const TAG = '[Keep_Watching]';
  // Solo il player su vixcloud.co (o un suo sottodominio): host esplicito, non una parola
  // qualsiasi nell'indirizzo.
  const PLAYER_RE = /^(https?:)?\/\/([a-z0-9-]+\.)*vixcloud\.co(:\d+)?\//i;
  const REQUIRED = ['autoplay', 'fullscreen'];
  const MARK = 'kw_autoplay=1';

  function patch(frame) {
    const src = frame.getAttribute('src') || '';
    // Solo l'iframe del player. Se il sito ne assegna l'URL in un secondo momento,
    // la modifica di src fa ripassare l'iframe da qui.
    if (!PLAYER_RE.test(src)) return;

    // 1. Permesso, prima di toccare l'URL.
    const current = (frame.getAttribute('allow') || '')
      .split(';').map((s) => s.trim()).filter(Boolean);
    const missing = REQUIRED.filter((p) => !current.some((c) => c.split(/\s+/)[0] === p));
    if (missing.length) frame.setAttribute('allow', [...current, ...missing].join('; '));

    // 2. Nuovo caricamento con il marcatore che rules.json lascia passare.
    //    La modifica di src riattiva l'observer, ma il marcatore evita il loop.
    if (!src.includes(MARK)) {
      frame.setAttribute('src', src + (src.includes('?') ? '&' : '?') + MARK);
      console.log(TAG, 'Player caricato con permesso:', frame.getAttribute('allow'));
    }
  }

  const scan = (node) => {
    if (node instanceof HTMLIFrameElement) patch(node);
    else if (node.querySelectorAll) node.querySelectorAll('iframe').forEach(patch);
  };

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes') patch(m.target);
      else m.addedNodes.forEach(scan);
    }
  }).observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  });
})();
