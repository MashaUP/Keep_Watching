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
 *   - nel nuovo episodio, avviare la riproduzione se è rimasta in pausa;
 *   - tenere lo stato del player (macchina a stati in lib/health.js), registrare gli eventi
 *     diagnostici e rispondere a "Verifica tutto" senza toccare il video.
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
  // Dopo il clic su "prossimo episodio" il sito ricarica l'iframe e questo documento sparisce.
  // Se dopo questo tempo è ancora qui, il clic non ha avuto effetto.
  const SWITCH_VERIFY_MS = 15 * 1000;
  // Nuovi clic automatici dopo un clic senza effetto (poi si chiede all'utente).
  const SWITCH_RETRIES = 1;
  // Attesa breve del pulsante "prossimo episodio" se il player dice che esiste ma non c'è ancora.
  const NEXT_WAIT_MS = 3000;
  // Dopo una ricarica per streaming bloccato: entro quanto il video deve ripartire.
  const RELOAD_VERIFY_MS = 20 * 1000;

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
  let switching = false;    // clic su "prossimo episodio" fatto, in attesa del nuovo episodio
  let switchTimer = null;   // verifica dell'effetto del clic
  let switchRetries = 0;
  let arrivedBySwitch = false; // questo episodio è arrivato da un cambio automatico riuscito
  let introSkippedAt = null;   // secondo da cui l'intro è stata saltata in questo episodio
  let creditsArmedAt = null;   // anticipo (s) con cui scatterà il cambio ai titoli, se noto

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

  // ---------- Stato del player e cronologia eventi ----------
  // Lo stato viene da ciò che si osserva sul <video> (eventi e avanzamento reale), mai dalle
  // sole impostazioni. Il service worker lo conserva per scheda (Centro salute, Panoramica).

  const health = { lastError: null, lastRecovery: null, lastNext: null, controls: null, nextIssue: null };

  /** Evento per la cronologia locale (raggruppato e ripulito dal service worker). */
  const logEvent = (ev) => send({ type: 'kwEvent', ev: { at: Date.now(), ...ev } });

  let healthTimer = null;
  function reportHealth() {
    if (healthTimer) return;
    // Al massimo un aggiornamento al secondo: lo stato può cambiare spesso durante un salto.
    healthTimer = setTimeout(() => {
      healthTimer = null;
      send({ type: 'kwHealth', player: snapshot() });
    }, 1000);
  }

  const IMPORTANT = ['stalled', 'recovering', 'error', 'fatal', 'unsupported'];
  const machine = KWHealth.createMachine('loading', (to, from, event) => {
    reportHealth();
    if (IMPORTANT.includes(to) || (IMPORTANT.includes(from) && to === 'playing')) {
      log(`Stato del player: ${KWHealth.STATES[from].label} → ${KWHealth.STATES[to].label}.`);
    }
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

  /** Stato attuale per il Centro salute e la Panoramica del menu (nessun dato sensibile). */
  function snapshot() {
    const v = findVideo();
    const nb = nextButtonState();
    return {
      at: Date.now(),
      state: machine.state,
      since: machine.since,
      title: EPISODE.title,
      name: EPISODE.name,
      hasNext: EPISODE.hasNext,
      nextButton: nb.reason,
      video: Boolean(v),
      duration: v && isFinite(v.duration) ? Math.round(v.duration) : null,
      position: v ? Math.round(v.currentTime) : null,
      controls: health.controls,
      autoplayAllowed: autoplayAllowed(),
      arrivedBySwitch,
      introSkippedAt,
      creditsArmedAt,
      watchdog: settings.watchdog ? stallStage : null,
      lastError: health.lastError,
      lastRecovery: health.lastRecovery,
      lastNext: health.lastNext,
      nextIssue: health.nextIssue
    };
  }

  // Permesso di autoplay del documento del player (aggiunto da autoplay-permission.js).
  // null se il browser non permette di saperlo.
  function autoplayAllowed() {
    try {
      const fp = document.featurePolicy;
      return fp && typeof fp.allowsFeature === 'function' ? fp.allowsFeature('autoplay') : null;
    } catch (e) {
      return null;
    }
  }

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
    // Estensione sospesa (o cambio automatico spento) durante un conto alla rovescia: si
    // chiude senza cambiare episodio. Solo quando cambiano proprio queste opzioni: fino alla
    // 1.4.1 bastava qualsiasi scrittura nello storage (per esempio le statistiche ogni 15 s)
    // per chiudere anche i riquadri del timer o dell'intro con il cambio automatico spento.
    const switchedOff = (k) => changes[k] && changes[k].newValue === false;
    if (switchedOff('enabled') || switchedOff('autoNext')) {
      if (['next', 'limit'].includes(panel.kind())) panel.close();
      cancelSilentNext();
    }
    if (switchedOff('enabled')) {
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
      icon: 'question',
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

  function handleNoNext(reason = 'missing') {
    if (endHandled) return;
    endHandled = true;

    // Il player dice che c'è un episodio successivo ma il pulsante non si trova (o non si
    // può usare): quasi certamente il sito ha cambiato la barra dei controlli. Si avvisa sempre.
    if (EPISODE.hasNext) {
      const why = { hidden: 'presente ma nascosto', disabled: 'presente ma disattivato' }[reason] || 'non trovato';
      health.nextIssue = reason;
      health.lastNext = { at: Date.now(), result: 'failed', reason: `Pulsante ${why}` };
      machine.send('manual-needed');
      logEvent({ cat: 'next', level: 'error', fn: 'Prossimo episodio', msg: `C'è un episodio successivo ma il pulsante è ${why}`,
        action: 'Cambio automatico', result: 'Non eseguito: il sito potrebbe essere cambiato' });
      log(`ATTENZIONE: c'è un episodio successivo ma il pulsante è ${why}. Controlla NEXT_SELECTOR (docs/MANUTENZIONE.md).`);
      send({
        type: 'notify',
        title: 'Keep_Watching: pulsante non trovato',
        message: 'C\'è un episodio successivo ma il pulsante non è stato trovato: il sito potrebbe essere cambiato.'
      });
      return;
    }

    log('Nessun altro episodio disponibile.', tabState());
    logEvent({ cat: 'next', fn: 'Prossimo episodio', msg: 'Ultimo episodio disponibile: nessun cambio' });
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

  /**
   * Pulsante "prossimo episodio" utilizzabile: nella barra di JW Player, con un riquadro
   * (non display:none) e non disattivato. Non si guarda la visibilità CSS: JW nasconde la
   * barra quando il mouse è fermo, ma il pulsante resta valido.
   * reason: ok | none (nessun successivo) | missing | hidden | disabled
   */
  function nextButtonState() {
    const all = [...document.querySelectorAll(NEXT_SELECTOR)];
    const usable = all.find((b) => b.getClientRects().length > 0 && !b.disabled && b.getAttribute('aria-disabled') !== 'true');
    if (usable) return { btn: usable, reason: 'ok' };
    if (!all.length) return { btn: null, reason: EPISODE.hasNext ? 'missing' : 'none' };
    return { btn: null, reason: all.some((b) => b.getClientRects().length > 0) ? 'disabled' : 'hidden' };
  }

  const findNextButton = () => nextButtonState().btn;

  /** Se il player dice che c'è un successivo, si aspetta un attimo che il pulsante compaia. */
  async function waitForNextButton(ms) {
    const end = Date.now() + ms;
    let st = nextButtonState();
    while (!st.btn && EPISODE.hasNext && Date.now() < end) {
      await new Promise((r) => setTimeout(r, 250));
      st = nextButtonState();
    }
    return st;
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
    if (switching) return; // un cambio è già partito: niente clic doppi
    cancelSilentNext();
    let st = nextButtonState();
    if (!st.btn && EPISODE.hasNext) st = await waitForNextButton(NEXT_WAIT_MS);
    if (!st.btn) return handleNoNext(st.reason);
    switching = true;
    machine.send('next-start');

    await bumpStreak();
    log(`${reason}, passo al successivo.`, tabState());
    // Titoli saltati dall'estensione (anche con "Vai ora" del conto alla rovescia).
    if (reason === 'Titoli di coda') {
      statsEvent('credits');
      logEvent({ cat: 'skip', fn: 'Salto titoli di coda', msg: `Titoli di coda: cambio a ${kwFormatTime(creditsArmedAt || 0)} dalla fine` });
    }
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
    clickNext(reason);
  }

  function clickNext(reason) {
    const btn = findNextButton();
    if (!btn) return switchFailed(reason, 'il pulsante è sparito prima del clic');
    health.lastNext = { at: Date.now(), result: 'pending', reason };
    logEvent({ cat: 'next', fn: 'Prossimo episodio', msg: `Cambio episodio (${reason})`,
      action: switchRetries ? 'Nuovo clic su "prossimo episodio"' : 'Clic su "prossimo episodio"', result: 'In attesa del nuovo episodio' });
    btn.click();
    clearTimeout(switchTimer);
    switchTimer = setTimeout(() => switchStillHere(reason), SWITCH_VERIFY_MS);
  }

  // Il documento è ancora qui dopo SWITCH_VERIFY_MS: il clic non ha cambiato episodio.
  async function switchStillHere(reason) {
    if (switchRetries < SWITCH_RETRIES && findNextButton()) {
      switchRetries += 1;
      log('Il clic su "prossimo episodio" non ha cambiato episodio: riprovo una volta.', tabState());
      logEvent({ cat: 'next', level: 'warn', fn: 'Prossimo episodio', msg: 'Il clic non ha cambiato episodio',
        action: 'Secondo clic', result: 'In attesa' });
      await chrome.storage.local.set({ pendingPlayAt: Date.now() });
      return clickNext(reason);
    }
    switchFailed(reason, 'il clic su "prossimo episodio" non ha avuto effetto');
  }

  function switchFailed(reason, why) {
    clearTimeout(switchTimer);
    switching = false;
    health.lastNext = { at: Date.now(), result: 'failed', reason: why };
    machine.send('next-failed');
    machine.send('manual-needed');
    chrome.storage.local.remove('pendingPlayAt');
    log(`Cambio episodio non riuscito: ${why}.`, tabState());
    logEvent({ cat: 'next', level: 'error', fn: 'Prossimo episodio', msg: 'Cambio episodio non riuscito',
      action: `${switchRetries + 1} clic su "prossimo episodio"`, result: `Fallito: ${why}` });
    if (cinema) exitCinema();
    // Avviso sempre visibile: è un errore, non un messaggio di servizio.
    panel.open({
      kind: 'nextfail',
      title: 'Cambio episodio non riuscito',
      text: 'Il clic su "prossimo episodio" non ha avuto effetto. Premilo tu sul player oppure ricarica la pagina.',
      icon: 'warn',
      tone: 'warn',
      buttons: [
        { label: 'Chiudi', onClick: () => {} },
        { label: 'Riprova', primary: true, onClick: () => { switchRetries = 0; doNext('Nuovo tentativo'); } }
      ]
    });
    if (document.hidden) {
      send({ type: 'notify', title: 'Keep_Watching: cambio episodio non riuscito',
        message: 'Il clic su "prossimo episodio" non ha avuto effetto. Torna sulla scheda per continuare.' });
    }
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
    if (nextInProgress() || switching || !settings.enabled || !settings.autoNext) return;
    fired = true;
    let st = nextButtonState();
    if (!st.btn && EPISODE.hasNext) st = await waitForNextButton(NEXT_WAIT_MS);
    if (!st.btn) return handleNoNext(st.reason);

    if (settings.stopAfter > 0 && (await currentStreak()) >= settings.stopAfter) return askToContinue();
    if (!settings.countdown) return doNext(reason);

    // Conto alla rovescia nascosto: il cambio avviene comunque, dopo lo stesso tempo.
    if (!popupOn('countdown')) {
      log(`${reason}: cambio tra ${settings.countdown} s (conto alla rovescia nascosto).`, tabState());
      silentNext = setTimeout(() => { silentNext = null; doNext(reason); }, settings.countdown * 1000);
      return;
    }

    log(`${reason}: conto alla rovescia di ${settings.countdown} s.`, tabState());
    logEvent({ cat: 'next', fn: 'Conto alla rovescia', msg: `${reason}: conto alla rovescia di ${settings.countdown} s` });
    panel.open({
      kind: 'next',
      title: EPISODE.title ? `Prossimo episodio di ${EPISODE.title}` : 'Prossimo episodio',
      icon: 'next',
      countdown: {
        seconds: settings.countdown,
        big: true,
        text: (s) => `Parte tra ${s} ${s === 1 ? 'secondo' : 'secondi'}`,
        onDone: () => doNext(reason)
      },
      buttons: [
        { label: 'Annulla', onClick: () => {
          log('Cambio episodio annullato.');
          logEvent({ cat: 'next', fn: 'Conto alla rovescia', msg: 'Cambio episodio annullato da te' });
        } },
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
    showPanel('sleep', { title: 'Timer di spegnimento', text, icon: 'sleep', buttons });
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
      icon: 'sleep',
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
    introSkippedAt = Math.round(from);
    log(`Intro saltata: da ${kwFormatTime(from)} a ${kwFormatTime(end)}.`);
    logEvent({ cat: 'skip', fn: 'Salto intro', msg: `Intro saltata fino a ${kwFormatTime(end)}` });
    statsEvent('intro');
    showPanel('confirm', {
      title: 'Intro saltata',
      icon: 'ok',
      tone: 'ok',
      countdown: { seconds: 6, text: () => `Ripresa da ${kwFormatTime(end)}`, onDone: () => {} },
      buttons: [{ label: 'Annulla', onClick: () => {
        video.currentTime = from;
        statsEvent('introUndo');
        logEvent({ cat: 'skip', fn: 'Salto intro', msg: 'Salto dell\'intro annullato da te' });
      } }]
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
      id: 'stopAtEnd',
      label: stopAtEnd ? 'Stop a fine episodio ✓' : 'Stop a fine episodio',
      active: stopAtEnd,
      onClick: toggleStopAtEnd
    });
    buttons.push({ id: 'help', label: '?', title: 'Scorciatoie da tastiera', extraClass: 'help', onClick: openGuide });

    if (flash && flash.until > Date.now()) {
      const b = buttons.find((x) => x.id === flash.id);
      if (b) b.label = flash.label;
    }
    // Solo i pulsanti scelti nel menu (Interfaccia sul video › Pulsanti sulla barra).
    // Se non ne resta nessuno la barra non compare; le scorciatoie funzionano comunque.
    return buttons.filter((b) => settings.toolbar[b.id] !== false);
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
    // Verifica tutto: la risposta arriva come messaggio a parte, perché ogni frame ne dà una.
    if (msg.type === 'kwHealthCheck') send({ type: 'kwHealthReport', reqId: msg.reqId, report: runChecks() });
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

  onVideo('ended', (v) => { machine.send('ended'); statsSample(v); handleEnd(v, 'Episodio finito'); flushStats(false); });

  // Stato del player dagli eventi del video. "Pronto" solo all'inizio (o dopo un periodo
  // senza video): dopo un salto canplay non deve far sembrare il video fermo.
  let detected = false;
  const onReady = (v) => {
    if (!v.currentSrc) return;
    if (machine.is('loading', 'unsupported')) machine.send('video-ready');
    if (!detected) {
      detected = true;
      const jw = document.querySelector(PLAYER_SELECTOR);
      health.controls = { player: Boolean(jw), controlbar: Boolean(document.querySelector('.jw-controlbar')) };
      logEvent({ cat: 'player', fn: 'Rilevamento del player', msg: `Player rilevato${EPISODE.name ? ` (${EPISODE.name})` : ''}`,
        result: jw ? 'JW Player con video HTML5' : 'Video HTML5 senza il contenitore di JW Player' });
      if (!jw) {
        logEvent({ cat: 'player', level: 'warn', fn: 'Rilevamento del player', msg: 'Contenitore .jwplayer non trovato',
          result: 'Barra e riquadri usano la pagina intera; il resto funziona' });
      }
      // Pulsante atteso ma assente: si controlla una volta, con calma, dopo il caricamento.
      if (EPISODE.hasNext) setTimeout(() => {
        const st = nextButtonState();
        if (st.btn) return;
        health.nextIssue = st.reason;
        reportHealth();
        logEvent({ cat: 'next', level: 'warn', fn: 'Prossimo episodio', msg: 'Pulsante "prossimo episodio" non trovato nel player',
          result: `Atteso (nextEpisode=1), stato: ${st.reason}` });
      }, 20000);
      reportHealth();
    }
  };
  onVideo('loadedmetadata', onReady);
  onVideo('canplay', onReady);
  onVideo('pause', (v) => { if (!v.ended) machine.send('pause'); });
  onVideo('waiting', () => machine.send('waiting'));

  let lastProgressCt = null;
  onVideo('timeupdate', (v) => {
    // Avanzamento vero (non un salto): il video sta suonando.
    if (!v.paused && !v.seeking && lastProgressCt !== null && v.currentTime > lastProgressCt && v.currentTime - lastProgressCt < 5) {
      machine.send('progress');
      reloadProgress(v);
    }
    lastProgressCt = v.currentTime;
    if (!loaded) return;
    statsSample(v);
    applyResume(v);
    maybeSkipIntro(v);
    checkSleep(v);
    refreshToolbar();

    const skip = creditsOffset(v);
    creditsArmedAt = skip || null;
    if (!skip || v.paused || v.currentTime < MIN_WATCHED_S) return;
    if (v.duration - v.currentTime <= skip) handleEnd(v, 'Titoli di coda');
  });

  onVideo('playing', (v) => {
    started = true;
    machine.send('playing');
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

  const recovery = (action, result, level = 'info') => {
    health.lastRecovery = { at: Date.now(), action, result };
    reportHealth();
    logEvent({ cat: 'recovery', level, fn: 'Ripresa dello streaming', msg: `${action}: ${result}`, action, result });
  };

  async function reloadEpisode(reason) {
    if (stallStage === 2) return; // una sola ricarica per episodio (anche con errori ripetuti)
    stallStage = 2;
    machine.send('recovery-start');
    const { lastReloadAt = 0 } = await chrome.storage.local.get('lastReloadAt');
    if (Date.now() - lastReloadAt < RELOAD_COOLDOWN_MS) {
      log(`${reason}: ricaricato da poco, non riprovo.`);
      machine.send('recovery-failed');
      machine.send('manual-needed');
      recovery('Ricarica dell\'episodio', 'non ripetuta: già ricaricato da meno di 3 minuti, serve ricaricare la pagina a mano', 'error');
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
    const res = await send({ type: 'reloadEpisode', minute: Math.floor(seconds / 60) });
    if (res && res.handled) {
      recovery('Ricarica dell\'episodio', `chiesta al sito dal minuto ${Math.floor(seconds / 60)} (${reason.toLowerCase()})`, 'warn');
      return;
    }
    // Nessuna pagina del sito ha risposto: niente ricarica possibile da qui.
    await chrome.storage.local.remove(['resume', 'pendingPlayAt']);
    machine.send('recovery-failed');
    machine.send('manual-needed');
    recovery('Ricarica dell\'episodio', 'impossibile: la pagina del sito non ha risposto (percorso cambiato?). Ricarica la pagina a mano', 'error');
    showToast('recovery', 'Lo streaming non riparte: ricarica la pagina', { tone: 'warn', ms: 8000 });
    send({ type: 'notify', title: 'Keep_Watching: streaming bloccato',
      message: 'Non è stato possibile ricaricare l\'episodio: ricarica la pagina.' });
  }

  // Dopo una ricarica (chiave "resume"): il recupero è riuscito solo se il video riparte.
  let reloadCheck = null;
  function armReloadCheck() {
    reloadCheck = { at: Date.now(), done: false };
    setTimeout(() => {
      if (!reloadCheck || reloadCheck.done) return;
      reloadCheck.done = true;
      const v = findVideo();
      if (v && v.paused) return recovery('Ricarica dell\'episodio', 'video ricaricato ma in pausa: premi play');
      recovery('Ricarica dell\'episodio', 'il video non è ripartito entro 20 secondi', 'error');
    }, RELOAD_VERIFY_MS);
  }
  function reloadProgress() {
    if (!reloadCheck || reloadCheck.done) return;
    reloadCheck.done = true;
    recovery('Ricarica dell\'episodio', 'riuscita: il video è ripartito');
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
        machine.send('progress');
        recovery('Salto di 1 secondo', 'riuscito: lo streaming è ripartito');
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
      // Durata sconosciuta (NaN): fino alla 1.4.1 il salto diventava NaN e generava un errore.
      const target = isFinite(v.duration) ? Math.min(cur + 1, v.duration - 1) : cur + 1;
      const kind = v.readyState < 3 ? 'in attesa di dati da oltre 12 s (buffering prolungato)' : 'dati presenti ma il tempo non avanza da 12 s';
      machine.send('stall-detected');
      machine.send('recovery-start');
      log('Video bloccato da 12 secondi: salto avanti di 1 secondo.', tabState());
      logEvent({ cat: 'recovery', level: 'warn', fn: 'Ripresa dello streaming', msg: `Video bloccato: ${kind}`,
        from: 'playing', to: 'stalled', action: 'Salto di 1 secondo', result: 'In corso' });
      showToast('recovery', 'Streaming bloccato: provo a farlo ripartire…', { tone: 'warn', ms: 6000 });
      v.currentTime = target;
      lastPos = target;
    } else if (stallStage === 1) {
      reloadEpisode('Video ancora bloccato');
    }
  }, WATCHDOG_TICK_MS);

  onVideo('error', (v) => {
    const err = KWHealth.classifyMediaError(v.error && v.error.code);
    health.lastError = { at: Date.now(), code: err.code, label: err.label, text: err.text };
    reportHealth();
    // Interrotto: di solito un cambio di pagina, non un guasto.
    if (!err.recoverable) return logEvent({ cat: 'player', fn: 'Video', msg: err.label, result: err.text });
    machine.send('error');
    logEvent({ cat: 'player', level: 'error', fn: 'Video', msg: `${err.label} (codice ${err.code})`, result: err.text });
    if (!started) {
      // Il video non è mai partito: una ricarica automatica rischierebbe di girare a vuoto.
      machine.send('manual-needed');
      showToast('recovery', 'Il video non si carica: ricarica la pagina', { tone: 'warn', ms: 8000 });
      return;
    }
    if (settings.enabled && settings.watchdog && stallStage < 2) reloadEpisode(`Errore del video: ${err.label.toLowerCase()}`);
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
    if (document.hidden) {
      logEvent({ cat: 'player', fn: 'Avvio del nuovo episodio', msg: `Avvio rimandato (${error})`, result: 'Riprovo quando torni sulla scheda' });
      resumeWhenVisible(video);
    } else if (error === 'NotAllowedError') {
      // Il browser vuole un gesto dell'utente: non si aggira, si chiede.
      machine.send('manual-needed');
      logEvent({ cat: 'player', level: 'warn', fn: 'Avvio del nuovo episodio', msg: 'Il browser ha bloccato l\'avvio automatico',
        result: 'Serve premere play sul player' });
      showToast('recovery', 'Premi play per far partire l\'episodio', { tone: 'warn', ms: 8000 });
    } else {
      logEvent({ cat: 'player', level: 'warn', fn: 'Avvio del nuovo episodio', msg: `Avvio non riuscito (${error})` });
    }
  }

  async function autoPlay() {
    const video = await waitForVideo(PLAYER_READY_TIMEOUT_MS);
    if (!video) {
      logEvent({ cat: 'player', level: 'warn', fn: 'Avvio del nuovo episodio', msg: 'Player non pronto entro 30 secondi', result: 'Avvio automatico non eseguito' });
      return log('Player non pronto in tempo, niente avvio automatico.', tabState());
    }
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

  // Nessun video dopo il tempo di attesa: struttura del player diversa da quella prevista.
  setTimeout(() => {
    if (findVideo() || !machine.is('loading')) return;
    machine.send('video-missing');
    const jw = Boolean(document.querySelector(PLAYER_SELECTOR));
    logEvent({ cat: 'player', level: 'error', fn: 'Rilevamento del player', msg: 'Nessun video nel player dopo 30 secondi',
      result: jw ? 'Contenitore JW Player presente, video assente: player in errore o cambiato' : 'Né video né JW Player: pagina diversa da quella prevista' });
  }, PLAYER_READY_TIMEOUT_MS);

  window.addEventListener('pagehide', () => {
    clearTimeout(switchTimer);
    // Il player sparisce (cambio episodio, ricarica, uscita): il menu non deve mostrarlo ancora attivo.
    send({ type: 'kwHealth', player: { ...snapshot(), state: 'closed', at: Date.now() } });
  });

  // ---------- Verifica tutto (non distruttiva: solo letture) ----------

  function runChecks() {
    const H = KWHealth;
    const v = findVideo();
    const st = machine.state;
    const checks = [];
    const off = H.DETAIL.off;

    // Player e caricamento
    if (v && !['unsupported', 'fatal'].includes(st)) {
      checks.push(H.check('player', 'Player', 'ok', `Video rilevato. Stato: ${H.STATES[st].label}.`, { detail: 'verified' }));
    } else if (st === 'loading') {
      checks.push(H.check('player', 'Player', 'check', 'Il player è ancora in caricamento: riprova tra qualche secondo.', { detail: 'idle' }));
    } else if (st === 'fatal') {
      checks.push(H.check('player', 'Player', 'na', `${H.STATES[st].text}`, { detail: 'error' }));
    } else {
      checks.push(H.check('player', 'Player', 'na', 'Nessun video nel player: la pagina del player è diversa da quella prevista.', { detail: 'error' }));
    }

    // Controlli di JW Player
    const jw = document.querySelector(PLAYER_SELECTOR);
    const bar = document.querySelector('.jw-controlbar');
    checks.push(jw && bar
      ? H.check('controls', 'Controlli del player', 'ok', 'Contenitore e barra di JW Player trovati.', { detail: 'verified' })
      : H.check('controls', 'Controlli del player', 'check', `${jw ? 'Barra dei controlli' : 'Contenitore .jwplayer'} non trovato: barra e riquadri dell'estensione funzionano, il cambio episodio dipende dal pulsante.`, { detail: 'unverified' }));

    // Permesso di autoplay
    const ap = autoplayAllowed();
    checks.push(ap === true
      ? H.check('autoplay', 'Avvio automatico con audio', 'ok', 'Il player ha il permesso di autoplay.', { detail: 'verified' })
      : ap === false
        ? H.check('autoplay', 'Avvio automatico con audio', 'na', 'Il player non ha il permesso di autoplay: il nuovo episodio può partire muto o fermo.', { detail: 'error' })
        : H.check('autoplay', 'Avvio automatico con audio', 'check', 'Il browser non permette di controllare il permesso.', { detail: 'unverified' }));

    // Prossimo episodio
    const nb = nextButtonState();
    if (!settings.enabled || !settings.autoNext) {
      checks.push(H.check('next', 'Prossimo episodio automatico', 'na', !settings.enabled ? 'Keep_Watching è sospeso.' : 'Cambio automatico spento (anche dal profilo Manuale).', { detail: 'off' }));
    } else if (nb.reason === 'none') {
      checks.push(H.check('next', 'Prossimo episodio automatico', 'na', 'Ultimo episodio disponibile: non c\'è un successivo.', { detail: 'idle' }));
    } else if (!nb.btn) {
      const why = { missing: 'non trovato', hidden: 'nascosto', disabled: 'disattivato' }[nb.reason];
      checks.push(H.check('next', 'Prossimo episodio automatico', 'na', `Il player dice che c'è un episodio successivo ma il pulsante è ${why}: il sito potrebbe essere cambiato.`, { detail: 'error' }));
    } else if (health.lastNext && health.lastNext.result === 'failed') {
      checks.push(H.check('next', 'Prossimo episodio automatico', 'na', `Ultimo tentativo fallito: ${health.lastNext.reason}.`, { detail: 'error' }));
    } else if (arrivedBySwitch) {
      checks.push(H.check('next', 'Prossimo episodio automatico', 'ok', 'Pulsante trovato; questo episodio è arrivato da un cambio automatico riuscito.', { detail: 'verified' }));
    } else {
      checks.push(H.check('next', 'Prossimo episodio automatico', 'check', 'Pulsante trovato e utilizzabile. Il cambio vero si verifica solo a fine episodio.', { detail: 'unverified' }));
    }

    // Salto intro
    const conf = seriesConf();
    if (!settings.enabled || !settings.introSkip) {
      checks.push(H.check('intro', 'Salto intro', 'na', 'Spento nelle impostazioni.', { detail: 'off' }));
    } else if (!EPISODE.title) {
      checks.push(H.check('intro', 'Salto intro', 'na', 'Titolo della serie non disponibile nell\'indirizzo del player.', { detail: 'unsupported' }));
    } else if (!conf.introEnd) {
      checks.push(H.check('intro', 'Salto intro', 'check', 'Intro non segnata per questa serie: premi "Fine intro qui" quando finisce.', { detail: 'idle' }));
    } else if (introSkippedAt !== null) {
      checks.push(H.check('intro', 'Salto intro', 'ok', `Saltata in questo episodio fino a ${kwFormatTime(conf.introEnd)}.`, { detail: 'verified' }));
    } else {
      checks.push(H.check('intro', 'Salto intro', 'check', `Segnata fino a ${kwFormatTime(conf.introEnd)}: scatta quando un episodio parte dall'inizio.`, { detail: 'unverified' }));
    }

    // Titoli di coda
    const configured = Number.isFinite(conf.creditsStart) ? conf.creditsStart : settings.skipCredits;
    if (!settings.enabled || !configured) {
      checks.push(H.check('credits', 'Salto titoli di coda', 'na', 'Spento: si cambia episodio alla fine del video.', { detail: 'off' }));
    } else if (!v || !isFinite(v.duration)) {
      checks.push(H.check('credits', 'Salto titoli di coda', 'check', `Impostato a ${kwFormatTime(configured)} dalla fine; durata del video non ancora nota.`, { detail: 'unverified' }));
    } else if (!creditsOffset(v)) {
      checks.push(H.check('credits', 'Salto titoli di coda', 'check', `Ignorato in questo episodio: ${kwFormatTime(configured)} lascerebbe meno di un minuto di video.`, { detail: 'idle' }));
    } else {
      checks.push(H.check('credits', 'Salto titoli di coda', 'check', `Pronto: il cambio parte a ${kwFormatTime(creditsOffset(v))} dalla fine.`, { detail: 'unverified' }));
    }

    // Ripresa dello streaming
    const lr = health.lastRecovery;
    if (!settings.enabled || !settings.watchdog) {
      checks.push(H.check('recovery', 'Ripresa dello streaming', 'na', 'Spenta nelle impostazioni.', { detail: 'off' }));
    } else if (st === 'stalled' || st === 'recovering') {
      checks.push(H.check('recovery', 'Ripresa dello streaming', 'check', 'Recupero in corso.', { detail: 'idle' }));
    } else if (lr && /impossibil|non ripetuta|non è ripartito/.test(lr.result)) {
      checks.push(H.check('recovery', 'Ripresa dello streaming', 'na', `Ultimo tentativo: ${lr.action}, ${lr.result}.`, { detail: 'error' }));
    } else {
      const ago = Math.round((Date.now() - lastTickAt) / 1000);
      checks.push(H.check('recovery', 'Ripresa dello streaming', ago < 10 ? 'ok' : 'check',
        ago < 10 ? `Sorveglianza attiva (ultimo controllo ${ago} s fa)${lr ? `; ultimo recupero: ${lr.result}` : ''}.` : 'Sorveglianza rallentata dal browser (scheda in background).',
        { detail: ago < 10 ? 'verified' : 'unverified' }));
    }
    return { frame: 'player', state: st, checks, snapshot: snapshot() };
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
      armReloadCheck();
    }

    checkSeasonSleep();

    if (Date.now() - s.pendingPlayAt >= PENDING_PLAY_MS) return;
    chrome.storage.local.remove('pendingPlayAt');
    // Il cambio dal player precedente è arrivato fin qui: è la prova che ha funzionato.
    if (!r || resumeTarget === null) {
      arrivedBySwitch = true;
      health.lastNext = { at: Date.now(), result: 'ok', reason: 'nuovo episodio caricato' };
      logEvent({ cat: 'next', fn: 'Prossimo episodio', msg: `Nuovo episodio caricato${EPISODE.name ? `: ${EPISODE.name}` : ''}`, result: 'Cambio riuscito' });
    }
    if (s.enabled && s.autoPlay) autoPlay();
  });
})();
