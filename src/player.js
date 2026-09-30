/**
 * Keep_Watching — script del player.
 *
 * Gira nell'iframe del player (vixcloud.co/embed/…, JW Player 8), che viene creato
 * da zero a ogni episodio. Si occupa di:
 *   - rilevare la fine dell'episodio (o l'inizio dei titoli di coda) e cliccare
 *     "prossimo episodio";
 *   - nel nuovo episodio, avviare la riproduzione se è rimasto in pausa.
 *
 * Il passaggio di informazioni tra un episodio e il successivo avviene tramite
 * chrome.storage.local (chiave pendingPlayAt), perché ogni episodio è un documento nuovo.
 */
(() => {
  'use strict';

  const TAG = '[Keep_Watching]';

  // Pulsante "prossimo episodio" aggiunto dal sito alla barra di JW Player.
  // NON usare .jw-icon-next: è il "Successivo" nativo di JW (playlist), non quello visibile.
  // Nota: il sito gli assegna per errore aria-label="Indietro di 10 Secondi".
  const NEXT_SELECTOR = '.jw-controlbar .next-episode';

  // Finestra entro cui il nuovo episodio considera valido il cambio appena avvenuto.
  const PENDING_PLAY_MS = 30 * 1000;
  // Tempo massimo di attesa perché JW Player colleghi il video alla sorgente.
  const PLAYER_READY_TIMEOUT_MS = 20 * 1000;
  // Evita che "salta i titoli di coda" scatti su video appena caricati o molto corti.
  const MIN_WATCHED_S = 60;

  let settings = { ...KW_DEFAULTS };
  let fired = false;

  const log = (...a) => console.log(TAG, ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isVisible = (el) => el.getClientRects().length > 0;

  chrome.storage.local.get(KW_DEFAULTS).then((s) => { settings = s; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of Object.keys(KW_DEFAULTS)) {
      if (changes[key]) settings[key] = changes[key].newValue;
    }
  });

  // ---------- Cambio episodio ----------

  // true se il limite "fermati dopo N episodi" consente un altro cambio.
  async function streakAllowsNext() {
    if (!settings.stopAfter) return true;

    const { streak = 0, lastAutoAt = 0 } = await chrome.storage.local.get(['streak', 'lastAutoAt']);
    const current = Date.now() - lastAutoAt > KW_STREAK_RESET_MS ? 0 : streak;

    if (current >= settings.stopAfter) {
      await chrome.storage.local.set({ streak: 0, lastAutoAt: 0 });
      log(`Limite di ${settings.stopAfter} episodi di fila raggiunto, mi fermo.`);
      return false;
    }
    await chrome.storage.local.set({ streak: current + 1, lastAutoAt: Date.now() });
    return true;
  }

  async function goNext(reason) {
    if (fired || !settings.autoNext) return;

    const btn = document.querySelector(NEXT_SELECTOR);
    if (!btn || !isVisible(btn)) {
      log('Nessun pulsante "prossimo episodio": ultimo episodio disponibile.');
      return;
    }

    fired = true;
    if (!(await streakAllowsNext())) return;

    log(`${reason}, passo al successivo.`);
    // Il segnale va salvato prima del click: il nuovo episodio lo leggerà all'avvio.
    await chrome.storage.local.set({ pendingPlayAt: Date.now() });
    btn.click();
  }

  // Gli eventi media non fanno bubbling ma attraversano la fase di capture:
  // un listener sul document intercetta gli eventi di qualsiasi <video>,
  // anche se JW Player lo crea dopo il caricamento di questo script.
  document.addEventListener('ended', (e) => {
    if (e.target instanceof HTMLVideoElement) goNext('Episodio finito');
  }, true);

  document.addEventListener('timeupdate', (e) => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement) || !settings.skipCredits) return;
    if (v.paused || !isFinite(v.duration) || v.currentTime < MIN_WATCHED_S) return;
    if (v.duration - v.currentTime <= settings.skipCredits) goNext('Titoli di coda');
  }, true);

  // Se l'utente torna indietro e riguarda il finale, consenti un nuovo cambio.
  document.addEventListener('play', (e) => {
    if (e.target instanceof HTMLVideoElement) fired = false;
  }, true);

  // Anche un click manuale su "prossimo episodio" fa partire da solo il nuovo episodio.
  document.addEventListener('click', (e) => {
    if (e.isTrusted && e.target instanceof Element && e.target.closest(NEXT_SELECTOR)) {
      chrome.storage.local.set({ pendingPlayAt: Date.now() });
    }
  }, true);

  // ---------- Avvio del nuovo episodio ----------
  // Con il permesso di autoplay (autoplay-permission.js) di solito è JW Player stesso
  // ad avviare l'episodio; questa funzione interviene solo se è rimasto in pausa.

  async function waitForVideo(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const v = document.querySelector('video');
      if (v && v.currentSrc) return v;
      await sleep(300);
    }
    return null;
  }

  async function autoPlay() {
    const video = await waitForVideo(PLAYER_READY_TIMEOUT_MS);
    if (!video) return log('Player non pronto in tempo, niente avvio automatico.');
    if (!video.paused) return log('Il nuovo episodio è già in riproduzione.');

    // Se in un episodio precedente l'audio è stato tolto dall'estensione,
    // JW Player potrebbe ricordarselo: lo riattiviamo.
    const { mutedByKW } = await chrome.storage.local.get({ mutedByKW: false });
    if (mutedByKW) {
      video.muted = false;
      await chrome.storage.local.set({ mutedByKW: false });
    }

    try {
      await video.play();
      log('Nuovo episodio avviato.');
    } catch (err) {
      if (err.name !== 'NotAllowedError') return log('Avvio non riuscito:', err.name, err.message);

      // Il browser rifiuta l'avvio con audio: si riparte senza, che è sempre consentito.
      log('Il browser blocca l\'avvio con audio (NotAllowedError), riprovo senza audio.');
      video.muted = true;
      await chrome.storage.local.set({ mutedByKW: true });
      try { await video.play(); log('Nuovo episodio avviato senza audio.'); }
      catch (e) { log('Avvio non riuscito anche senza audio:', e.name); }
    }
  }

  chrome.storage.local.get({ ...KW_DEFAULTS, pendingPlayAt: 0 }).then((s) => {
    if (Date.now() - s.pendingPlayAt >= PENDING_PLAY_MS) return;
    chrome.storage.local.remove('pendingPlayAt');
    if (s.autoPlay) autoPlay();
  });
})();
