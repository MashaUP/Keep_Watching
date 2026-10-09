/**
 * Keep_Watching — script del player.
 *
 * Gira nell'iframe del player (vixcloud.co/embed/…, JW Player 8), che viene creato
 * da zero a ogni episodio. Si occupa di:
 *   - rilevare la fine dell'episodio (o l'inizio dei titoli di coda, anche per serie);
 *   - mostrare il conto alla rovescia, o la domanda al raggiungimento del limite
 *     di episodi, e poi cliccare "prossimo episodio";
 *   - saltare l'intro nelle serie in cui è stata segnata e mostrare la barra di
 *     pulsanti sul player (toolbar.js);
 *   - timer di spegnimento (a tempo, fine episodio, fine stagione) con dissolvenza;
 *   - pausa quando la scheda viene nascosta (opzionale);
 *   - far ripartire lo streaming bloccato (salto di 1 s, poi ricarica dell'episodio);
 *   - passare alla modalità cinema se si stava guardando a schermo intero;
 *   - nel nuovo episodio, avviare la riproduzione se è rimasta in pausa.
 *
 * Ogni episodio è un documento nuovo: le informazioni da un episodio al successivo
 * passano da chrome.storage.local (chiavi pendingPlayAt, sleep, resume, series).
 *
 * Scheda nascosta (finestra ridotta a icona): Chrome rallenta i timer, quindi le
 * funzioni legate al tempo del video usano i suoi eventi (timeupdate), non i timer.
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
  // Dissolvenza del volume prima che il timer di spegnimento fermi il video.
  const FADE_S = 30;
  // Pulsanti della barra: "+60 s" nei primi minuti, "Fine intro qui" e "Inizio titoli qui"
  // solo nella parte iniziale e finale dell'episodio.
  const PLUS60_WINDOW_S = 3 * 60;
  const INTRO_WINDOW_S = 10 * 60;
  const CREDITS_WINDOW_S = 10 * 60;
  // Watchdog: dopo quanto un video che dovrebbe suonare ma non avanza è considerato bloccato.
  const STALL_MS = 12 * 1000;
  const WATCHDOG_TICK_MS = 2000;
  // Una seconda ricarica entro questo tempo non viene fatta: si avvisa l'utente.
  const RELOAD_COOLDOWN_MS = 3 * 60 * 1000;
  // Validità della posizione da ripristinare dopo una ricarica.
  const RESUME_MAX_AGE_MS = 90 * 1000;

  const settings = { ...KW_DEFAULTS };
  let loaded = false;       // impostazioni lette dallo storage
  let series = {};          // dati per serie (vedi defaults.js)
  let sleep = null;         // timer di spegnimento (vedi defaults.js)
  let cinema = false;
  let fired = false;        // fine episodio già gestita (cambio, stop o annullamento)
  let endHandled = false;   // assenza di un episodio successivo già gestita
  let started = false;      // il video ha iniziato a suonare almeno una volta
  let introDone = false;    // il salto intro è già stato valutato per questo episodio
  let resumeTarget = null;  // secondo da ripristinare dopo una ricarica
  let seasonBlock = false;  // fine stagione raggiunta con il timer "fine stagione"
  let pausedByHide = false; // video messo in pausa da "pausa quando cambi scheda"
  let fadeBase = null;      // volume prima della dissolvenza
  let flash = null;         // { id, label, until } — conferma temporanea sulla barra

  const log = (...a) => console.log(TAG, ...a);
  const tabState = () => (document.hidden ? '[scheda nascosta]' : '[scheda visibile]');
  const episodes = (n) => `${n} ${n === 1 ? 'episodio' : 'episodi'}`;
  const send = (msg) => chrome.runtime.sendMessage(msg)
    .catch((e) => log('Messaggio non consegnato:', msg.type, e.message));
  const exitCinema = () => send({ type: 'exitCinema' });
  const getContainer = () => document.querySelector(PLAYER_SELECTOR) || document.body;

  const panel = kwCreatePanel(getContainer);
  const toolbar = kwCreateToolbar(getContainer);

  // Dati dell'episodio dall'URL del player, che non cambia per tutta la vita del documento:
  // t = titolo e d = episodio (in base64, es. "S1:E1 On the road"), nextEpisode=1 se c'è
  // un successivo, minute=N se il sito fa partire l'episodio da un minuto preciso.
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
    const name = decode(params.get('d'));
    const season = name && /^S(\d+)\s*:/i.exec(name);
    return {
      title: decode(params.get('t')),
      name,
      season: season ? Number(season[1]) : null,
      hasNext: params.get('nextEpisode') === '1',
      startMinute: Number(params.get('minute')) || 0
    };
  })();

  const seriesConf = () => (EPISODE.title && series[EPISODE.title]) || {};

  const findVideo = () => {
    const v = document.querySelector('video');
    return v && v.currentSrc ? v : null;
  };

  // Anticipo sulla fine in cui l'episodio è considerato finito: quello della serie, se
  // segnato, altrimenti quello generale. Ignorato se più lungo dell'episodio stesso.
  function creditsOffset(v) {
    const conf = seriesConf();
    const skip = Number.isFinite(conf.creditsStart) ? conf.creditsStart : settings.skipCredits;
    if (!skip || !isFinite(v.duration) || v.duration - skip < MIN_WATCHED_S) return 0;
    return skip;
  }

  async function updateSeries(changes) {
    if (!EPISODE.title) return;
    const { series: all = {} } = await chrome.storage.local.get('series');
    all[EPISODE.title] = { ...all[EPISODE.title], ...changes };
    await chrome.storage.local.set({ series: all });
  }

  const setSleep = (value) => chrome.storage.local.set({ sleep: value });

  // ---------- Impostazioni ----------

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of Object.keys(KW_DEFAULTS)) {
      if (changes[key]) settings[key] = changes[key].newValue;
    }
    if (changes.cinema) cinema = changes.cinema.newValue;
    if (changes.series) series = changes.series.newValue || {};
    if (changes.sleep) {
      sleep = changes.sleep.newValue;
      checkSeasonSleep();
    }
    // Estensione sospesa durante un conto alla rovescia: si chiude senza cambiare episodio.
    if (!settings.enabled || !settings.autoNext) panel.close();
    if (!settings.enabled) {
      const v = findVideo();
      if (v) restoreFade(v);
    }
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
    if (panel.isOpen() || !settings.enabled || !settings.autoNext) return;
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

  // Fine dell'episodio (o inizio dei titoli): timer "fine episodio" oppure cambio episodio.
  function handleEnd(video, reason) {
    if (fired || !loaded) return;
    const active = kwActiveSleep(sleep);
    if (settings.enabled && active && active.mode === 'episode') {
      fired = true;
      return stopForSleep(video, 'Fermato a fine episodio, come richiesto.', true);
    }
    goNext(reason);
  }

  // ---------- Timer di spegnimento ----------

  function restoreFade(video) {
    if (fadeBase === null) return;
    video.volume = fadeBase;
    fadeBase = null;
  }

  function applyFade(video, remainingS) {
    if (!settings.sleepFade || remainingS > FADE_S) return restoreFade(video);
    if (fadeBase === null) fadeBase = video.volume;
    video.volume = fadeBase * Math.max(0, Math.min(1, remainingS / FADE_S));
  }

  async function stopForSleep(video, text, offerNext) {
    video.pause();
    // Il volume si ripristina a video fermo: JW Player lo ricorda per gli episodi successivi.
    restoreFade(video);
    await setSleep({ mode: 'off' });
    log('Timer di spegnimento:', text, tabState());
    if (cinema) exitCinema();

    const buttons = offerNext && findNextButton()
      ? [{ label: 'Chiudi', onClick: () => {} }, { label: 'Prossimo episodio', primary: true, onClick: () => doNext('Prossimo dopo il timer') }]
      : [{ label: 'Riprendi', primary: true, onClick: () => video.play().catch(() => {}) }];
    panel.open({ title: 'Timer di spegnimento', text, buttons });
  }

  // Controllo a ogni timeupdate: dissolvenza e scadenza del timer.
  function checkSleep(video) {
    const active = settings.enabled ? kwActiveSleep(sleep) : null;
    if (!active || video.paused) return restoreFade(video);

    let remaining = null;
    if (active.mode === 'time') {
      remaining = (active.until - Date.now()) / 1000;
    } else if (active.mode === 'episode' && isFinite(video.duration)) {
      remaining = (video.duration - creditsOffset(video) - video.currentTime) / (video.playbackRate || 1);
    }
    if (remaining === null) return restoreFade(video);

    applyFade(video, remaining);
    if (active.mode === 'time' && remaining <= 0 && !fired) {
      fired = true;
      stopForSleep(video, `Fermato dopo ${active.minutes} ${active.minutes === 1 ? 'minuto' : 'minuti'}, come richiesto.`, false);
    }
  }

  // Timer "fine stagione": al primo episodio letto si memorizza la stagione; quando si
  // carica un episodio di un'altra stagione, il video viene fermato.
  function checkSeasonSleep() {
    const active = kwActiveSleep(sleep);
    if (!loaded || !settings.enabled || !active || active.mode !== 'season' || EPISODE.season === null) return;
    if (active.season == null) {
      setSleep({ ...active, season: EPISODE.season });
      return;
    }
    if (active.season === EPISODE.season || seasonBlock) return;

    seasonBlock = true;
    setSleep({ mode: 'off' });
    log(`Timer di spegnimento: stagione ${active.season} finita, fermo il video.`, tabState());
    const v = findVideo();
    if (v && !v.paused) v.pause();
    if (cinema) exitCinema();
    panel.open({
      title: 'Timer di spegnimento',
      text: `Stagione ${active.season} finita, come richiesto.`,
      buttons: [{
        label: 'Guarda comunque',
        primary: true,
        onClick: () => {
          seasonBlock = false;
          const video = findVideo();
          if (video) video.play().catch(() => {});
        }
      }]
    });
    if (document.hidden && settings.notifyEnd) {
      send({
        type: 'notify',
        title: EPISODE.title ? `${EPISODE.title}: stagione finita` : 'Stagione finita',
        message: `Timer di spegnimento: video fermato alla fine della stagione ${active.season}.`
      });
    }
  }

  // ---------- Salto intro e ripristino della posizione ----------

  function applyResume(video) {
    if (resumeTarget === null || !isFinite(video.duration)) return;
    const target = Math.min(resumeTarget, video.duration - 5);
    resumeTarget = null;
    if (Math.abs(video.currentTime - target) > 3) video.currentTime = target;
    log(`Episodio ripreso da ${kwFormatTime(target)}.`);
  }

  function maybeSkipIntro(video) {
    if (introDone || !loaded || video.paused) return;
    introDone = true;
    const end = seriesConf().introEnd;
    // Non si salta se l'episodio riparte da un punto preciso (minute= o ricarica).
    if (!settings.enabled || !settings.introSkip || !end || EPISODE.startMinute > 0) return;
    if (video.currentTime >= end - 1) return;

    const from = video.currentTime;
    video.currentTime = end;
    log(`Intro saltata: da ${kwFormatTime(from)} a ${kwFormatTime(end)}.`);
    panel.open({
      title: 'Intro saltata',
      countdown: { seconds: 6, text: () => `Ripresa da ${kwFormatTime(end)}`, onDone: () => {} },
      buttons: [{ label: 'Annulla', onClick: () => { video.currentTime = from; } }]
    });
  }

  // ---------- Barra di pulsanti sul player ----------

  function flashLabel(id, label) {
    flash = { id, label, until: Date.now() + 2000 };
    refreshToolbar();
    setTimeout(refreshToolbar, 2100);
  }

  function toolbarButtons(video) {
    if (!loaded || !settings.enabled || !video || !isFinite(video.duration)) return [];
    const t = video.currentTime;
    const left = video.duration - t;
    const conf = seriesConf();
    const buttons = [];

    if (EPISODE.title) {
      if (conf.introEnd && t < conf.introEnd - 1) {
        buttons.push({ id: 'skipIntro', label: 'Salta intro', primary: true, onClick: () => {
          const v = findVideo();
          if (v) v.currentTime = conf.introEnd;
        } });
      } else if (t < PLUS60_WINDOW_S) {
        buttons.push({ id: 'plus60', label: '+60 s', onClick: () => {
          const v = findVideo();
          if (v) v.currentTime = Math.min(v.currentTime + 60, v.duration - 1);
        } });
      }
      if (t < INTRO_WINDOW_S) {
        buttons.push({ id: 'setIntro', label: 'Fine intro qui', onClick: () => {
          const v = findVideo();
          const at = v && Math.round(v.currentTime);
          if (!at || at < 5) return flashLabel('setIntro', 'Troppo presto');
          updateSeries({ introEnd: at });
          log(`Fine intro di ${EPISODE.title} segnata a ${kwFormatTime(at)}.`);
          flashLabel('setIntro', `Intro fino a ${kwFormatTime(at)} ✓`);
        } });
      }
      if (left < CREDITS_WINDOW_S && left > 5) {
        buttons.push({ id: 'setCredits', label: 'Inizio titoli qui', onClick: () => {
          const v = findVideo();
          if (!v) return;
          const before = Math.round(v.duration - v.currentTime);
          if (v.duration - before < MIN_WATCHED_S) return flashLabel('setCredits', 'Troppo presto');
          updateSeries({ creditsStart: before });
          log(`Titoli di ${EPISODE.title} segnati: ultimi ${kwFormatTime(before)}.`);
          flashLabel('setCredits', `Titoli: ultimi ${kwFormatTime(before)} ✓`);
        } });
      }
    }

    const active = kwActiveSleep(sleep);
    const stopAtEnd = !!active && active.mode === 'episode';
    buttons.push({
      id: 'sleepEpisode',
      label: stopAtEnd ? 'Stop a fine episodio ✓' : 'Stop a fine episodio',
      active: stopAtEnd,
      onClick: () => setSleep(stopAtEnd ? { mode: 'off' } : { mode: 'episode', setAt: Date.now() })
    });

    if (flash && flash.until > Date.now()) {
      const b = buttons.find((x) => x.id === flash.id);
      if (b) b.label = flash.label;
    }
    return buttons;
  }

  function refreshToolbar() {
    toolbar.render(toolbarButtons(findVideo()));
  }

  for (const type of ['mousemove', 'pointermove', 'touchstart']) {
    document.addEventListener(type, () => {
      refreshToolbar();
      toolbar.show();
    }, { capture: true, passive: true });
  }

  // ---------- Eventi del video ----------
  // Gli eventi media non fanno bubbling ma attraversano la fase di capture:
  // un listener sul document intercetta gli eventi di qualsiasi <video>,
  // anche se JW Player lo crea dopo il caricamento di questo script.
  const onVideo = (type, handler) => document.addEventListener(type, (e) => {
    if (e.target instanceof HTMLVideoElement) handler(e.target);
  }, true);

  onVideo('ended', (v) => handleEnd(v, 'Episodio finito'));

  onVideo('timeupdate', (v) => {
    if (!loaded) return;
    applyResume(v);
    maybeSkipIntro(v);
    checkSleep(v);
    refreshToolbar();

    const skip = creditsOffset(v);
    if (!skip || v.paused || v.currentTime < MIN_WATCHED_S) return;
    if (v.duration - v.currentTime <= skip) handleEnd(v, 'Titoli di coda');
  });

  onVideo('playing', (v) => {
    started = true;
    // Timer "fine stagione" scattato: il player non deve ripartire da solo.
    if (seasonBlock) v.pause();
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

  // ---------- Pausa quando la scheda viene nascosta ----------

  document.addEventListener('visibilitychange', () => {
    const v = findVideo();
    if (!v || !settings.enabled || !settings.pauseOnHidden) return;
    if (document.hidden) {
      if (!v.paused) {
        pausedByHide = true;
        v.pause();
        log('Scheda nascosta: video in pausa.');
      }
    } else if (pausedByHide) {
      pausedByHide = false;
      v.play().then(() => log('Scheda di nuovo visibile: riprendo.'), (e) => log('Ripresa non riuscita:', e.name));
    }
  });

  // ---------- Streaming bloccato ----------

  let lastPos = null;          // posizione al controllo precedente
  let lastTickAt = Date.now();  // momento del controllo precedente
  let lastMove = Date.now();    // ultima volta in cui il video è avanzato normalmente
  let goodPos = 0;              // ultima posizione in cui il video suonava davvero
  let stallStage = 0;           // 0 normale, 1 salto fatto, 2 ricarica chiesta o utente avvisato

  async function reloadEpisode(reason) {
    stallStage = 2;
    const { lastReloadAt = 0 } = await chrome.storage.local.get('lastReloadAt');
    if (Date.now() - lastReloadAt < RELOAD_COOLDOWN_MS) {
      log(`${reason}: ricaricato da poco, non riprovo.`);
      send({
        type: 'notify',
        title: 'Keep_Watching: streaming bloccato',
        message: 'Lo streaming non riparte nemmeno dopo la ricarica. Prova a ricaricare la pagina.'
      });
      return;
    }
    const seconds = Math.floor(goodPos);
    log(`${reason}: ricarico l'episodio da ${kwFormatTime(seconds)}.`);
    await chrome.storage.local.set({
      lastReloadAt: Date.now(),
      pendingPlayAt: Date.now(),
      resume: { title: EPISODE.title, name: EPISODE.name, seconds, at: Date.now() }
    });
    send({ type: 'reloadEpisode', minute: Math.floor(seconds / 60) });
  }

  onVideo('playing', (v) => { goodPos = v.currentTime; });

  setInterval(() => {
    const v = findVideo();
    const now = Date.now();
    const elapsedS = (now - lastTickAt) / 1000;
    lastTickAt = now;
    if (!v || !started || !settings.enabled || !settings.watchdog) return;

    const cur = v.currentTime;
    const delta = lastPos === null ? 0 : cur - lastPos;
    lastPos = cur;
    if (v.paused || v.ended) {
      lastMove = now;
      stallStage = 0;
      return;
    }

    // Avanzamento normale: in avanti e non più di quanto è passato (con un margine).
    // Il confronto con il tempo trascorso regge anche i timer rallentati della scheda nascosta.
    if (delta > 0 && delta <= elapsedS * Math.max(1, v.playbackRate) + 2) {
      if (stallStage) log('Lo streaming è ripartito.');
      goodPos = cur;
      lastMove = now;
      stallStage = 0;
      return;
    }

    if (now - lastMove < STALL_MS) return;
    if (stallStage === 0) {
      stallStage = 1;
      lastMove = now;
      const target = Math.min(cur + 1, v.duration - 1);
      log('Video bloccato da 12 secondi: salto avanti di 1 secondo.', tabState());
      v.currentTime = target;
      lastPos = target;
    } else if (stallStage === 1) {
      reloadEpisode('Video ancora bloccato');
    }
  }, WATCHDOG_TICK_MS);

  onVideo('error', () => {
    if (started && settings.enabled && settings.watchdog && stallStage < 2) reloadEpisode('Errore del video');
  });

  // ---------- Avvio del nuovo episodio ----------
  // Con il permesso di autoplay (autoplay-permission.js) di solito è JW Player stesso
  // ad avviare l'episodio; questa parte interviene solo se è rimasto in pausa.

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
      if (video.ended || pausedByHide || seasonBlock) return; // pause volute
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
    if (seasonBlock) return;
    applyResume(video);
    if (!video.paused) return log('Il nuovo episodio è già in riproduzione.', tabState());

    if (document.hidden && settings.pauseOnHidden) {
      pausedByHide = true;
      return log('Scheda nascosta: il nuovo episodio partirà al ritorno sulla scheda.');
    }

    // Se in un episodio precedente l'audio è stato tolto dall'estensione,
    // JW Player potrebbe ricordarselo: lo si riattiva.
    const { mutedByKW } = await chrome.storage.local.get({ mutedByKW: false });
    if (mutedByKW) {
      video.muted = false;
      await chrome.storage.local.set({ mutedByKW: false });
    }

    await startPlayback(video);
  }

  // ---------- Avvio dello script ----------

  chrome.storage.local.get({
    ...KW_DEFAULTS, cinema: false, series: {}, sleep: null, pendingPlayAt: 0, resume: null
  }).then((s) => {
    for (const key of Object.keys(KW_DEFAULTS)) settings[key] = s[key];
    cinema = s.cinema;
    series = s.series || {};
    sleep = s.sleep;
    loaded = true;

    // Posizione da ripristinare dopo una ricarica per streaming bloccato.
    const r = s.resume;
    if (r && Date.now() - r.at < RESUME_MAX_AGE_MS && r.title === EPISODE.title && r.name === EPISODE.name) {
      resumeTarget = r.seconds;
      introDone = true;
      chrome.storage.local.remove('resume');
    }

    checkSeasonSleep();

    if (Date.now() - s.pendingPlayAt >= PENDING_PLAY_MS) return;
    chrome.storage.local.remove('pendingPlayAt');
    if (s.enabled && s.autoPlay) autoPlay();
  });
})();
