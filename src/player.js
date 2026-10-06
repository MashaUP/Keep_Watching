/**
 * Keep_Watching — script del player.
 *
 * Gira nell'iframe del player (vixcloud.co/embed/…, JW Player 8), che viene creato
 * da zero a ogni episodio. Si occupa di:
 *   - rilevare la fine dell'episodio (o l'inizio dei titoli di coda);
 *   - mostrare il conto alla rovescia, o la domanda al raggiungimento del limite
 *     di episodi, e poi cliccare "prossimo episodio";
 *   - passare alla modalità cinema se si stava guardando a schermo intero;
 *   - chiedere al service worker le notifiche;
 *   - nel nuovo episodio, avviare la riproduzione se è rimasta in pausa.
 *
 * Ogni episodio è un documento nuovo: le informazioni da un episodio al successivo
 * passano da chrome.storage.local (chiave pendingPlayAt).
 *
 * Scheda nascosta (finestra ridotta a icona): Chrome rallenta i timer, quindi l'attesa
 * del video usa i suoi eventi; se l'avvio non riesce, si riprova al ritorno sulla scheda.
 */
(() => {
  'use strict';

  const TAG = '[Keep_Watching]';

  // Pulsante "prossimo episodio" aggiunto dal sito alla barra di JW Player.
  // NON usare .jw-icon-next: è il "Successivo" nativo di JW (playlist), non quello visibile.
  // Nota: il sito gli assegna per errore aria-label="Indietro di 10 Secondi".
  const NEXT_SELECTOR = '.jw-controlbar .next-episode';
  // Pulsante schermo intero di JW Player: in modalità cinema serve per uscire.
  const FULLSCREEN_SELECTOR = '.jw-icon-fullscreen';
  // Contenitore di JW Player, l'elemento che va a schermo intero.
  const PLAYER_SELECTOR = '.jwplayer';

  // Finestra entro cui il nuovo episodio considera valido il cambio appena avvenuto.
  const PENDING_PLAY_MS = 30 * 1000;
  // Tempo massimo di attesa perché JW Player colleghi il video alla sorgente.
  const PLAYER_READY_TIMEOUT_MS = 30 * 1000;
  // Dopo l'avvio, per quanto tempo controllare che il video non venga rimesso in pausa.
  const PLAY_CHECK_MS = 5 * 1000;
  // Evita che "salta i titoli di coda" scatti su video appena caricati o molto corti.
  const MIN_WATCHED_S = 60;
  // Attesa massima per l'uscita dallo schermo intero prima di passare alla modalità cinema.
  const FULLSCREEN_EXIT_TIMEOUT_MS = 1500;

  const settings = { ...KW_DEFAULTS };
  let cinema = false;
  let fired = false;       // cambio episodio già avviato (o annullato) per questo episodio
  let endHandled = false;  // assenza di un episodio successivo già gestita

  const log = (...a) => console.log(TAG, ...a);
  const tabState = () => (document.hidden ? '[scheda nascosta]' : '[scheda visibile]');
  const episodes = (n) => `${n} ${n === 1 ? 'episodio' : 'episodi'}`;
  const send = (msg) => chrome.runtime.sendMessage(msg)
    .catch((e) => log('Messaggio non consegnato:', msg.type, e.message));
  const exitCinema = () => send({ type: 'exitCinema' });

  const panel = kwCreatePanel(() => document.querySelector(PLAYER_SELECTOR) || document.body);

  // Dati dell'episodio dall'URL del player, che non cambia per tutta la vita del documento:
  // t = titolo e d = episodio (in base64, es. "S1:E1 On the road"), nextEpisode=1 se c'è un successivo.
  const EPISODE = (() => {
    const params = new URLSearchParams(location.search);
    const decode = (value) => {
      if (!value) return null;
      try {
        return new TextDecoder().decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)));
      } catch (e) {
        return null;
      }
    };
    return { title: decode(params.get('t')), name: decode(params.get('d')), hasNext: params.get('nextEpisode') === '1' };
  })();

  chrome.storage.local.get({ ...KW_DEFAULTS, cinema: false }).then((s) => {
    for (const key of Object.keys(KW_DEFAULTS)) settings[key] = s[key];
    cinema = s.cinema;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of Object.keys(KW_DEFAULTS)) {
      if (changes[key]) settings[key] = changes[key].newValue;
    }
    if (changes.cinema) cinema = changes.cinema.newValue;
    // Estensione sospesa durante un conto alla rovescia: si chiude senza cambiare episodio.
    if (!settings.enabled || !settings.autoNext) panel.close();
  });

  // ---------- Limite di episodi di fila ----------

  async function currentStreak() {
    const { streak = 0, lastAutoAt = 0 } = await chrome.storage.local.get(['streak', 'lastAutoAt']);
    return Date.now() - lastAutoAt > KW_STREAK_RESET_MS ? 0 : streak;
  }

  async function bumpStreak() {
    if (!settings.stopAfter) return;
    await chrome.storage.local.set({ streak: (await currentStreak()) + 1, lastAutoAt: Date.now() });
  }

  const resetStreak = () => chrome.storage.local.set({ streak: 0, lastAutoAt: 0 });

  function askToContinue() {
    const n = settings.stopAfter;
    log(`Limite di ${episodes(n)} di fila raggiunto, chiedo se continuare.`, tabState());
    panel.open({
      title: `Hai visto ${episodes(n)} di fila`,
      text: 'Vuoi passare al prossimo?',
      buttons: [
        {
          label: 'Basta così',
          onClick: async () => {
            log('Visione interrotta al limite di episodi.');
            await resetStreak();
            if (cinema) exitCinema();
          }
        },
        {
          label: 'Continua',
          primary: true,
          onClick: async () => {
            await resetStreak();
            doNext('Continua dopo il limite');
          }
        }
      ]
    });

    if (document.hidden && settings.notifyEnd) {
      send({
        type: 'notify',
        title: 'Keep_Watching: limite raggiunto',
        message: `Hai visto ${episodes(n)} di fila${EPISODE.title ? ` di ${EPISODE.title}` : ''}. Torna sulla scheda per continuare.`
      });
    }
  }

  // ---------- Nessun episodio successivo ----------

  function handleNoNext() {
    if (endHandled) return;
    endHandled = true;

    // Il player dice che c'è un episodio successivo ma il pulsante non si trova:
    // quasi certamente il sito ha cambiato la barra dei controlli. Si avvisa sempre.
    if (EPISODE.hasNext) {
      log('ATTENZIONE: c\'è un episodio successivo ma il pulsante non è stato trovato. Controlla NEXT_SELECTOR (docs/MANUTENZIONE.md).');
      send({
        type: 'notify',
        title: 'Keep_Watching: pulsante non trovato',
        message: 'C\'è un episodio successivo ma il pulsante non è stato trovato: il sito potrebbe essere cambiato.'
      });
      return;
    }

    log('Nessun altro episodio disponibile.', tabState());
    if (cinema) exitCinema();
    if (settings.notifyEnd) {
      send({
        type: 'notify',
        title: EPISODE.title ? `${EPISODE.title}: episodi finiti` : 'Episodi finiti',
        message: `Hai visto l'ultimo episodio disponibile${EPISODE.name ? ` (${EPISODE.name})` : ''}.`
      });
    }
  }

  // ---------- Cambio episodio ----------

  function findNextButton() {
    const btn = document.querySelector(NEXT_SELECTOR);
    return btn && btn.getClientRects().length > 0 ? btn : null;
  }

  function exitFullscreenAndWait() {
    return new Promise((resolve) => {
      if (!document.fullscreenElement) return resolve();
      const done = () => {
        clearTimeout(timer);
        document.removeEventListener('fullscreenchange', done);
        resolve();
      };
      document.addEventListener('fullscreenchange', done);
      const timer = setTimeout(done, FULLSCREEN_EXIT_TIMEOUT_MS);
      document.exitFullscreen().catch(done);
    });
  }

  async function doNext(reason) {
    if (!findNextButton()) return handleNoNext();

    await bumpStreak();
    log(`${reason}, passo al successivo.`, tabState());
    // Il segnale va salvato prima del click: il nuovo episodio lo leggerà all'avvio.
    await chrome.storage.local.set({ pendingPlayAt: Date.now() });

    // A schermo intero: si esce dallo schermo intero del player (che sparirà con il cambio)
    // e si passa alla modalità cinema, che sopravvive al cambio episodio.
    if (settings.keepFullscreen && document.fullscreenElement) {
      await exitFullscreenAndWait();
      await send({ type: 'enterCinema' });
      log('Modalità schermo intero tra episodi attivata.');
    }

    // Si cerca di nuovo il pulsante: l'uscita dallo schermo intero può ridisegnare la barra.
    const btn = findNextButton();
    if (btn) btn.click();
  }

  async function goNext(reason) {
    if (fired || panel.isOpen() || !settings.enabled || !settings.autoNext) return;
    if (!findNextButton()) return handleNoNext();
    fired = true;

    if (settings.stopAfter > 0 && (await currentStreak()) >= settings.stopAfter) return askToContinue();
    if (!settings.countdown) return doNext(reason);

    log(`${reason}: conto alla rovescia di ${settings.countdown} s.`, tabState());
    panel.open({
      title: EPISODE.title ? `Prossimo episodio di ${EPISODE.title}` : 'Prossimo episodio',
      countdown: {
        seconds: settings.countdown,
        text: (s) => `Parte tra ${s} ${s === 1 ? 'secondo' : 'secondi'}`,
        onDone: () => doNext(reason)
      },
      buttons: [
        { label: 'Annulla', onClick: () => log('Cambio episodio annullato.') },
        { label: 'Vai ora', primary: true, onClick: () => doNext(reason) }
      ]
    });
  }

  // Gli eventi media non fanno bubbling ma attraversano la fase di capture:
  // un listener sul document intercetta gli eventi di qualsiasi <video>,
  // anche se JW Player lo crea dopo il caricamento di questo script.
  const onVideo = (type, handler) => document.addEventListener(type, (e) => {
    if (e.target instanceof HTMLVideoElement) handler(e.target);
  }, true);

  onVideo('ended', () => goNext('Episodio finito'));

  onVideo('timeupdate', (v) => {
    const skip = settings.skipCredits;
    if (!skip || v.paused || !isFinite(v.duration) || v.currentTime < MIN_WATCHED_S) return;
    // Un anticipo più lungo dell'episodio stesso (meno il minimo da guardare) viene ignorato.
    if (v.duration - skip < MIN_WATCHED_S) return;
    if (v.duration - v.currentTime <= skip) goNext('Titoli di coda');
  });

  // Se l'utente torna indietro e riguarda il finale, consenti un nuovo cambio.
  onVideo('play', () => { if (!panel.isOpen()) fired = false; });

  // Anche un click manuale su "prossimo episodio" fa partire da solo il nuovo episodio.
  document.addEventListener('click', (e) => {
    if (e.isTrusted && e.target instanceof Element && e.target.closest(NEXT_SELECTOR)) {
      chrome.storage.local.set({ pendingPlayAt: Date.now() });
    }
  }, true);

  // In modalità cinema il pulsante schermo intero del player serve per uscire:
  // si bloccano gli eventi prima che arrivino a JW Player e si chiude la modalità.
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click']) {
    document.addEventListener(type, (e) => {
      if (!cinema || !(e.target instanceof Element) || !e.target.closest(FULLSCREEN_SELECTOR)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (type === 'click') exitCinema();
    }, true);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cinema) exitCinema();
  }, true);

  // ---------- Avvio del nuovo episodio ----------
  // Con il permesso di autoplay (autoplay-permission.js) di solito è JW Player stesso
  // ad avviare l'episodio; questa parte interviene solo se è rimasto in pausa.

  const findVideo = () => {
    const v = document.querySelector('video');
    return v && v.currentSrc ? v : null;
  };

  // Attende che JW Player colleghi la sorgente al <video>, tramite gli eventi media.
  function waitForVideo(timeoutMs) {
    return new Promise((resolve) => {
      const found = findVideo();
      if (found) return resolve(found);

      const events = ['loadstart', 'loadedmetadata', 'canplay'];
      const onEvent = () => {
        const v = findVideo();
        if (v) done(v);
      };
      const done = (v) => {
        events.forEach((type) => document.removeEventListener(type, onEvent, true));
        clearTimeout(timer);
        resolve(v);
      };
      events.forEach((type) => document.addEventListener(type, onEvent, true));
      const timer = setTimeout(() => done(findVideo()), timeoutMs);
    });
  }

  // Se il video viene rimesso in pausa subito dopo l'avvio con la scheda nascosta,
  // si riprova quando la scheda torna visibile.
  function watchForEarlyPause(video) {
    const onPause = () => {
      if (video.ended) return; // fine del video, non una pausa
      log('Il video è stato rimesso in pausa subito dopo l\'avvio.', tabState());
      if (document.hidden) resumeWhenVisible(video);
    };
    video.addEventListener('pause', onPause, { once: true });
    setTimeout(() => video.removeEventListener('pause', onPause), PLAY_CHECK_MS);
  }

  function resumeWhenVisible(video) {
    log('Riprovo l\'avvio quando la scheda torna visibile.');
    const onVisible = () => {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', onVisible);
      if (video.paused) startPlayback(video);
    };
    document.addEventListener('visibilitychange', onVisible);
  }

  // Restituisce null se il video è partito, altrimenti il nome dell'errore.
  const tryPlay = (video) => video.play().then(() => null, (e) => e.name);

  async function startPlayback(video) {
    let error = await tryPlay(video);

    // Il browser rifiuta l'avvio con audio: si riparte senza, che è sempre consentito.
    if (error === 'NotAllowedError') {
      log('Il browser blocca l\'avvio con audio (NotAllowedError), riprovo senza audio.', tabState());
      video.muted = true;
      await chrome.storage.local.set({ mutedByKW: true });
      error = await tryPlay(video);
    }

    if (!error) {
      log(video.muted ? 'Nuovo episodio avviato senza audio.' : 'Nuovo episodio avviato.', tabState());
      watchForEarlyPause(video);
      return;
    }

    log('Avvio non riuscito:', error, tabState());
    if (document.hidden) resumeWhenVisible(video);
  }

  async function autoPlay() {
    const video = await waitForVideo(PLAYER_READY_TIMEOUT_MS);
    if (!video) return log('Player non pronto in tempo, niente avvio automatico.', tabState());
    if (!video.paused) return log('Il nuovo episodio è già in riproduzione.', tabState());

    // Se in un episodio precedente l'audio è stato tolto dall'estensione,
    // JW Player potrebbe ricordarselo: lo si riattiva.
    const { mutedByKW } = await chrome.storage.local.get({ mutedByKW: false });
    if (mutedByKW) {
      video.muted = false;
      await chrome.storage.local.set({ mutedByKW: false });
    }

    await startPlayback(video);
  }

  chrome.storage.local.get({ ...KW_DEFAULTS, pendingPlayAt: 0 }).then((s) => {
    if (Date.now() - s.pendingPlayAt >= PENDING_PLAY_MS) return;
    chrome.storage.local.remove('pendingPlayAt');
    if (s.enabled && s.autoPlay) autoPlay();
  });
})();
