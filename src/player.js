/**
 * Keep_Watching — script del player.
 *
 * Gira nell'iframe del player (vixcloud.co/embed/…, JW Player 8), che viene creato
 * da zero a ogni episodio. Si occupa di:
 *   - rilevare la fine dell'episodio (o l'inizio dei titoli di coda, anche per serie);
 *   - mostrare il conto alla rovescia, o la domanda al raggiungimento del limite
 *     di episodi, e poi cliccare "prossimo episodio";
 *   - saltare l'intro nelle serie in cui è stata segnata e mostrare la barra di
 *     pulsanti sul player (toolbar.js), con il salto avanti di durata configurabile;
 *   - timer di spegnimento (a tempo, fine episodio, fine stagione) con dissolvenza;
 *   - pausa quando la scheda viene nascosta (opzionale);
 *   - far ripartire lo streaming bloccato (salto di 1 s, poi ricarica dell'episodio);
 *   - passare alla modalità cinema se si stava guardando a schermo intero;
 *   - eseguire le scorciatoie da tastiera (inoltrate dal service worker) e mostrarne la guida;
 *   - misurare il tempo di visione reale per le statistiche locali;
 *   - nel nuovo episodio, avviare la riproduzione se è rimasta in pausa.
 *
 * Popup sul player: ogni messaggio appartiene a una categoria (KW_POPUP_CATEGORIES).
 * Nascondere una categoria nasconde solo il messaggio, mai la funzione: vedi showPanel().
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
  // "Fine intro qui" e "Inizio titoli qui" solo nella parte iniziale e finale dell'episodio.
  const INTRO_WINDOW_S = 10 * 60;
  const CREDITS_WINDOW_S = 10 * 60;
  // Watchdog: dopo quanto un video che dovrebbe suonare ma non avanza è considerato bloccato.
  const STALL_MS = 12 * 1000;
  const WATCHDOG_TICK_MS = 2000;
  // Una seconda ricarica entro questo tempo non viene fatta: si avvisa l'utente.
  const RELOAD_COOLDOWN_MS = 3 * 60 * 1000;
  // Validità della posizione da ripristinare dopo una ricarica.
  const RESUME_MAX_AGE_MS = 90 * 1000;
  // Statistiche: ogni quanto il tempo di visione misurato viene mandato al service worker.
  const STATS_FLUSH_MS = 15 * 1000;

  let settings = kwSanitize({});
  let loaded = false;       // impostazioni lette dallo storage
  let series = {};          // dati per serie (vedi defaults.js)
  let sleep = null;         // timer di spegnimento (vedi defaults.js)
  let cinema = false;
  let fired = false;        // fine episodio già gestita (cambio, stop o annullamento)
  let endHandled = false;   // assenza di un episodio successivo già gestita
  let silentNext = null;    // cambio episodio in attesa con il conto alla rovescia nascosto
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
  const getSettings = () => settings;

  const panel = kwCreatePanel(getContainer, getSettings);
  const toast = kwCreateToast(getContainer, getSettings);
  const toolbar = kwCreateToolbar(getContainer, getSettings);
  const guide = kwCreateGuide(getContainer, getSettings, {
    onConfigure: () => send({ type: 'kwOpenShortcuts' })
  });

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
      startMinute: Number(params.get('minute')) || 0,
      // Per riconoscere lo stesso episodio nelle statistiche senza salvarne il titolo.
      key: KWStats.episodeKey(`${decode(params.get('t')) || ''}|${name || location.pathname}`)
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

  // ---------- Popup per categoria ----------

  const popupOn = (category) => kwPopupVisible(settings, category);

  /** Riquadro di una categoria: se la categoria è nascosta non compare (la funzione sì). */
  function showPanel(category, opts) {
    if (!popupOn(category)) return false;
    panel.open(opts);
    return true;
  }

  /** Avviso breve di una categoria. */
  function showToast(category, text, opts) {
    if (popupOn(category)) toast.show(text, opts);
  }

  // ---------- Impostazioni ----------

  function applySettings(raw) {
    settings = kwSanitize(raw);
    toolbar.applySettings();
    refreshToolbar();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (Object.keys(KW_DEFAULTS).some((k) => changes[k])) {
      const next = { ...settings };
      for (const key of Object.keys(KW_DEFAULTS)) if (changes[key]) next[key] = changes[key].newValue;
      applySettings(next);
    }
    if (changes.cinema) cinema = changes.cinema.newValue;
    if (changes.series) series = changes.series.newValue || {};
    if (changes.sleep) {
      sleep = changes.sleep.newValue;
      checkSeasonSleep();
      refreshToolbar();
    }
    // Estensione sospesa durante un conto alla rovescia: si chiude senza cambiare episodio.
    if (!settings.enabled || !settings.autoNext) {
      panel.close();
      cancelSilentNext();
    }
    if (!settings.enabled) {
      const v = findVideo();
      if (v) restoreFade(v);
      flushStats();
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
    if (document.hidden && settings.notifyEnd) {
      send({
        type: 'notify',
        title: 'Keep_Watching: limite raggiunto',
        message: `Hai visto ${episodes(n)} di fila${EPISODE.title ? ` di ${EPISODE.title}` : ''}. Torna sulla scheda per continuare.`
      });
    }

    // Domanda nascosta: la scelta sicura è fermarsi. Si continua premendo "prossimo
    // episodio" sul player, che azzera anche il conteggio (vedi il listener dei click).
    if (!popupOn('limit')) {
      log(`Limite di ${episodes(n)} di fila raggiunto: mi fermo (domanda nascosta).`, tabState());
      if (cinema) exitCinema();
      return;
    }

    log(`Limite di ${episodes(n)} di fila raggiunto, chiedo se continuare.`, tabState());
    panel.open({
      kind: 'limit',
      title: 'Vuoi continuare a guardare?',
      text: `Hai visto ${episodes(n)} di fila.`,
      icon: '?',
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
    cancelSilentNext();
    if (!findNextButton()) return handleNoNext();

    await bumpStreak();
    log(`${reason}, passo al successivo.`, tabState());
    // Titoli saltati dall'estensione (anche con "Vai ora" del conto alla rovescia).
    if (reason === 'Titoli di coda') statsEvent('credits');
    flushStats();
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

  function cancelSilentNext() {
    if (!silentNext) return;
    clearTimeout(silentNext);
    silentNext = null;
  }

  // Un cambio episodio è già in corso (conto alla rovescia o domanda sul limite)?
  // Gli altri riquadri, come "Intro saltata", non bloccano il cambio: vengono sostituiti.
  const nextInProgress = () => Boolean(silentNext) || ['next', 'limit'].includes(panel.kind());

  async function goNext(reason) {
    if (nextInProgress() || !settings.enabled || !settings.autoNext) return;
    if (!findNextButton()) return handleNoNext();
    fired = true;

    if (settings.stopAfter > 0 && (await currentStreak()) >= settings.stopAfter) return askToContinue();
    if (!settings.countdown) return doNext(reason);

    // Conto alla rovescia nascosto: il cambio avviene comunque, dopo lo stesso tempo.
    if (!popupOn('countdown')) {
      log(`${reason}: cambio tra ${settings.countdown} s (conto alla rovescia nascosto).`, tabState());
      silentNext = setTimeout(() => { silentNext = null; doNext(reason); }, settings.countdown * 1000);
      return;
    }

    log(`${reason}: conto alla rovescia di ${settings.countdown} s.`, tabState());
    panel.open({
      kind: 'next',
      title: EPISODE.title ? `Prossimo episodio di ${EPISODE.title}` : 'Prossimo episodio',
      icon: '▶',
      countdown: {
        seconds: settings.countdown,
        big: true,
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
    statsMaybeCompleted(video);
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
    showPanel('sleep', { title: 'Timer di spegnimento', text, icon: '⏾', buttons });
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
    showPanel('sleep', {
      title: 'Timer di spegnimento',
      text: `Stagione ${active.season} finita, come richiesto.`,
      icon: '⏾',
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

  // ---------- Salti: intro, salto avanti, ripristino della posizione ----------

  function applyResume(video) {
    if (resumeTarget === null || !isFinite(video.duration)) return;
    const target = Math.min(resumeTarget, video.duration - 5);
    resumeTarget = null;
    if (Math.abs(video.currentTime - target) > 3) video.currentTime = target;
    log(`Episodio ripreso da ${kwFormatTime(target)}.`);
    showToast('recovery', `Episodio ripreso da ${kwFormatTime(target)}`, { tone: 'ok' });
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
    statsEvent('intro');
    showPanel('confirm', {
      title: 'Intro saltata',
      icon: '✓',
      tone: 'ok',
      countdown: { seconds: 6, text: () => `Ripresa da ${kwFormatTime(end)}`, onDone: () => {} },
      buttons: [{ label: 'Annulla', onClick: () => { video.currentTime = from; statsEvent('introUndo'); } }]
    });
  }

  /**
   * Salto avanti della durata scelta (quickSkip). Si può ripetere quante volte si vuole:
   * ogni salto parte dalla posizione appena impostata. Non supera la fine del video se la
   * durata è nota; con durata sconosciuta salta comunque.
   */
  function quickSkip() {
    const v = findVideo();
    if (!v) return false;
    const from = v.currentTime;
    let target = from + settings.quickSkip;
    if (isFinite(v.duration) && v.duration > 0) target = Math.min(target, Math.max(0, v.duration - 1));
    if (!(target > from)) return false;
    v.currentTime = target;
    return true;
  }

  function skipIntroNow() {
    const v = findVideo();
    const end = seriesConf().introEnd;
    if (!v || !end || v.currentTime >= end - 1) return false;
    v.currentTime = end;
    return true;
  }

  /** "Fine intro qui": restituisce il testo di conferma, o null se troppo presto. */
  function markIntro() {
    const v = findVideo();
    const at = v && Math.round(v.currentTime);
    if (!EPISODE.title || !at || at < 5) return null;
    updateSeries({ introEnd: at });
    log(`Fine intro di ${EPISODE.title} segnata a ${kwFormatTime(at)}.`);
    return `Intro fino a ${kwFormatTime(at)} ✓`;
  }

  /** "Inizio titoli qui": salva quanti secondi prima della fine iniziano i titoli. */
  function markCredits() {
    const v = findVideo();
    if (!EPISODE.title || !v || !isFinite(v.duration)) return null;
    const before = Math.round(v.duration - v.currentTime);
    if (v.duration - before < MIN_WATCHED_S || before < 1) return null;
    updateSeries({ creditsStart: before });
    log(`Titoli di ${EPISODE.title} segnati: ultimi ${kwFormatTime(before)}.`);
    return `Titoli: ultimi ${kwFormatTime(before)} ✓`;
  }

  function toggleStopAtEnd() {
    const active = kwActiveSleep(sleep);
    const on = !!active && active.mode === 'episode';
    setSleep(on ? { mode: 'off' } : { mode: 'episode', setAt: Date.now() });
    return !on;
  }

  // ---------- Barra di pulsanti sul player ----------

  function flashLabel(id, label) {
    if (!popupOn('confirm')) return;
    flash = { id, label, until: Date.now() + 2000 };
    refreshToolbar();
    setTimeout(refreshToolbar, 2100);
  }

  function toolbarButtons(video) {
    if (!loaded || !settings.enabled || !video) return [];
    const t = video.currentTime;
    const known = isFinite(video.duration) && video.duration > 0;
    const left = known ? video.duration - t : Infinity;
    const conf = seriesConf();
    const buttons = [];

    if (EPISODE.title && conf.introEnd && t < conf.introEnd - 1) {
      buttons.push({ id: 'skipIntro', label: 'Salta intro', primary: true, onClick: skipIntroNow });
    }
    // Il salto avanti è sempre disponibile (anche ripetuto), tranne a fine video.
    if (!known || left > 1.5) {
      buttons.push({ id: 'quick', label: `+${settings.quickSkip} s`, title: `Avanti di ${settings.quickSkip} secondi`, onClick: quickSkip });
    }
    if (!settings.uiMinimal) {
      if (EPISODE.title && t < INTRO_WINDOW_S) {
        buttons.push({ id: 'setIntro', label: 'Fine intro qui', onClick: () => {
          const ok = markIntro();
          flashLabel('setIntro', ok || 'Troppo presto');
        } });
      }
      if (EPISODE.title && known && left < CREDITS_WINDOW_S && left > 5) {
        buttons.push({ id: 'setCredits', label: 'Inizio titoli qui', onClick: () => {
          const ok = markCredits();
          flashLabel('setCredits', ok || 'Troppo presto');
        } });
      }
      const active = kwActiveSleep(sleep);
      const stopAtEnd = !!active && active.mode === 'episode';
      buttons.push({
        id: 'sleepEpisode',
        label: stopAtEnd ? 'Stop a fine episodio ✓' : 'Stop a fine episodio',
        active: stopAtEnd,
        onClick: toggleStopAtEnd
      });
      buttons.push({ id: 'help', label: '?', title: 'Scorciatoie da tastiera', extraClass: 'help', onClick: openGuide });
    }

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

  // ---------- Scorciatoie e guida ----------

  const isEditable = (el) => Boolean(el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' ||
    (el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image'].includes(el.type))));

  /** Per la guida: perché un comando non è utilizzabile adesso (true se lo è). */
  function availability() {
    const v = findVideo();
    const t = v ? v.currentTime : 0;
    const known = v && isFinite(v.duration) && v.duration > 0;
    const off = 'Keep_Watching è sospeso';
    const conf = seriesConf();
    return {
      'toggle-enabled': true,
      'show-shortcuts': true,
      'quick-skip': !settings.enabled ? off : (v ? true : 'il video non è ancora pronto'),
      'skip-intro': !settings.enabled ? off : !EPISODE.title ? 'il titolo della serie non è disponibile'
        : !conf.introEnd ? 'intro non segnata per questa serie' : t >= conf.introEnd - 1 ? 'l\'intro è già passata' : true,
      'mark-intro': !settings.enabled ? off : t < INTRO_WINDOW_S ? true : 'solo nei primi 10 minuti',
      'mark-credits': !settings.enabled ? off : known && v.duration - t < CREDITS_WINDOW_S ? true : 'solo negli ultimi 10 minuti',
      'stop-at-end': !settings.enabled ? off : true
    };
  }

  async function openGuide() {
    const res = await send({ type: 'kwShortcutStates' });
    guide.open((res && res.states) || [], availability());
  }

  function runCommand(command, states) {
    if (command === 'show-shortcuts') {
      if (guide.isOpen()) guide.close();
      else guide.open(states || [], availability());
      return;
    }
    if (!settings.enabled) return;
    if (command === 'quick-skip') {
      if (quickSkip()) showToast('info', `Avanti di ${settings.quickSkip} s`);
    } else if (command === 'skip-intro') {
      if (skipIntroNow()) showToast('info', 'Intro saltata');
      else showToast('info', availability()['skip-intro'] === true ? 'Intro non saltata' : `Salta intro: ${availability()['skip-intro']}`);
    } else if (command === 'mark-intro') {
      const ok = markIntro();
      showToast('confirm', ok || 'Fine intro: troppo presto', { tone: ok ? 'ok' : 'warn' });
    } else if (command === 'mark-credits') {
      const ok = markCredits();
      showToast('confirm', ok || 'Inizio titoli: troppo presto', { tone: ok ? 'ok' : 'warn' });
    } else if (command === 'stop-at-end') {
      const on = toggleStopAtEnd();
      showToast('sleep', on ? 'Stop a fine episodio attivato' : 'Stop a fine episodio disattivato', { tone: on ? 'ok' : '' });
    }
    refreshToolbar();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'kwIsEditing') {
      // Risponde solo il frame dove si sta scrivendo: gli altri tacciono.
      if (document.hasFocus() && isEditable(document.activeElement)) sendResponse({ editing: true });
      return;
    }
    // La risposta conferma al service worker che un player ha ricevuto il comando.
    if (msg.type === 'kwCommand') { runCommand(msg.command, msg.states); sendResponse({ ok: true }); }
    if (msg.type === 'kwCloseGuide') { guide.close(); sendResponse({ ok: true }); }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (guide.isOpen()) guide.close();
    if (cinema) exitCinema();
  }, true);

  // ---------- Statistiche di visione (solo locali) ----------
  // Si conta solo il tempo in cui il video avanza davvero: niente pausa, caricamento o
  // salti. L'intervallo si misura con l'orologio monotono (performance.now) e si confronta
  // con l'avanzamento del video, così una scheda sospesa non aggiunge tempo inventato.

  const track = { last: null, pending: 0, est: false, contentPlayed: 0, startPos: null, completed: false };
  const statsOn = () => loaded && settings.enabled && settings.statsEnabled;

  function statsSample(v) {
    const now = performance.now();
    const playing = !v.paused && !v.ended && !v.seeking && v.readyState >= 3;
    if (track.last && track.last.playing && playing) {
      const dt = (now - track.last.perf) / 1000;
      const dct = v.currentTime - track.last.ct;
      const rate = v.playbackRate > 0 ? v.playbackRate : 1;
      if (dt > 0 && dct > 0 && dct <= dt * rate + 1.5) {
        track.pending += Math.min(dt, dct / rate + 0.25);
        track.contentPlayed += dct;
        if (dt > 20) track.est = true;
      }
    }
    if (playing && track.startPos === null) track.startPos = v.currentTime;
    track.last = { perf: now, ct: v.currentTime, playing };
  }

  function flushStats(playingNow) {
    const v = findVideo();
    if (v) statsSample(v);
    const playing = playingNow !== undefined ? playingNow : Boolean(v && !v.paused && !v.ended);
    const msg = { type: 'kwStats', status: { title: EPISODE.title, name: EPISODE.name, playing } };
    if (statsOn() && track.pending >= 0.5) {
      msg.play = { seconds: track.pending, estimated: track.est, at: Date.now() };
      track.pending = 0;
      track.est = false;
    }
    send(msg);
  }

  function statsEvent(type) {
    if (statsOn()) send({ type: 'kwStats', event: { type, key: type === 'completed' ? EPISODE.key : undefined, at: Date.now() } });
  }

  /**
   * Episodio completato: fine (o titoli) raggiunta dopo aver guardato davvero almeno metà
   * di quello che restava dal punto di partenza, minimo 60 secondi. Una volta per player;
   * il service worker scarta anche i doppioni dello stesso episodio entro 6 ore.
   */
  function statsMaybeCompleted(v) {
    if (track.completed || !isFinite(v.duration) || track.startPos === null) return;
    statsSample(v);
    const need = Math.max(MIN_WATCHED_S, 0.5 * (v.duration - track.startPos));
    if (track.contentPlayed < need) return;
    track.completed = true;
    statsEvent('completed');
  }

  setInterval(() => { if (findVideo()) flushStats(); }, STATS_FLUSH_MS);
  window.addEventListener('pagehide', () => flushStats(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushStats(); });

  // ---------- Eventi del video ----------
  // Gli eventi media non fanno bubbling ma attraversano la fase di capture:
  // un listener sul document intercetta gli eventi di qualsiasi <video>,
  // anche se JW Player lo crea dopo il caricamento di questo script.
  const onVideo = (type, handler) => document.addEventListener(type, (e) => {
    if (e.target instanceof HTMLVideoElement) handler(e.target);
  }, true);

  for (const type of ['playing', 'waiting', 'seeking', 'seeked', 'stalled', 'ratechange']) onVideo(type, statsSample);
  onVideo('pause', (v) => { statsSample(v); flushStats(false); });

  onVideo('ended', (v) => { statsSample(v); handleEnd(v, 'Episodio finito'); flushStats(false); });

  onVideo('timeupdate', (v) => {
    if (!loaded) return;
    statsSample(v);
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
  onVideo('play', () => {
    cancelSilentNext();
    if (!['next', 'limit'].includes(panel.kind())) fired = false;
  });

  // Click manuale su "prossimo episodio": il nuovo episodio parte da solo, e il conteggio
  // degli episodi di fila riparte (hai scelto tu di continuare).
  document.addEventListener('click', (e) => {
    if (e.isTrusted && e.target instanceof Element && e.target.closest(NEXT_SELECTOR)) {
      cancelSilentNext();
      flushStats();
      chrome.storage.local.set({ pendingPlayAt: Date.now() });
      resetStreak();
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
      showToast('recovery', 'Lo streaming non riparte: prova a ricaricare la pagina', { tone: 'warn', ms: 8000 });
      send({
        type: 'notify',
        title: 'Keep_Watching: streaming bloccato',
        message: 'Lo streaming non riparte nemmeno dopo la ricarica. Prova a ricaricare la pagina.'
      });
      return;
    }
    const seconds = Math.floor(goodPos);
    log(`${reason}: ricarico l'episodio da ${kwFormatTime(seconds)}.`);
    showToast('recovery', `Ricarico l'episodio da ${kwFormatTime(seconds)}…`, { tone: 'warn', ms: 6000 });
    flushStats(false);
    await chrome.storage.local.set({
      lastReloadAt: Date.now(),
      pendingPlayAt: Date.now(),
      resume: { title: EPISODE.title, name: EPISODE.name, seconds, at: Date.now() }
    });
    send({ type: 'reloadEpisode', minute: Math.floor(seconds / 60) });
  }

  onVideo('playing', (v) => { goodPos = v.currentTime; });
  // Un salto (dell'utente, della barra o dell'intro) non è un blocco: il conteggio riparte
  // dalla nuova posizione. Senza questo, molti salti di fila sembravano uno streaming fermo.
  onVideo('seeked', (v) => {
    lastPos = v.currentTime;
    lastMove = Date.now();
  });

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
      if (stallStage) {
        log('Lo streaming è ripartito.');
        showToast('recovery', 'Lo streaming è ripartito', { tone: 'ok' });
      }
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
      showToast('recovery', 'Streaming bloccato: provo a farlo ripartire…', { tone: 'warn', ms: 6000 });
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
    cinema = s.cinema;
    series = s.series || {};
    sleep = s.sleep;
    loaded = true;
    applySettings(s);

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
