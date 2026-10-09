/**
 * Keep_Watching — impostazioni condivise tra background, player, cinema e popup.
 *
 * Chiavi in chrome.storage.local:
 *   Opzioni (modificabili dal popup):
 *     enabled         boolean  interruttore generale (anche con la scorciatoia da tastiera)
 *     autoNext        boolean  passa al prossimo episodio a fine episodio
 *     autoPlay        boolean  avvia il nuovo episodio se si carica in pausa
 *     keepFullscreen  boolean  resta a schermo intero tra un episodio e l'altro
 *     notifyEnd       boolean  notifiche sul desktop (fine episodi, limite, timer)
 *     introSkip       boolean  salta l'intro nelle serie in cui è stata segnata
 *     pauseOnHidden   boolean  pausa quando la scheda viene nascosta, ripresa al ritorno
 *     watchdog        boolean  fa ripartire lo streaming se si blocca
 *     sleepFade       boolean  abbassa il volume prima che il timer di spegnimento fermi il video
 *     countdown       number   secondi di conto alla rovescia prima del cambio (0 = immediato)
 *     skipCredits     number   secondi prima della fine in cui cambiare episodio (0 = alla fine);
 *                              valori predefiniti nel popup o personalizzati (minuti + secondi)
 *     stopAfter       number   cambi automatici di fila prima di chiedere se continuare (0 = mai)
 *   Dati per serie:
 *     series          object   { "<titolo>": { introEnd, creditsStart } } — introEnd: secondo
 *                              di fine intro; creditsStart: secondi prima della fine in cui
 *                              iniziano i titoli. Il titolo viene dal parametro t dell'URL del player.
 *   Timer di spegnimento:
 *     sleep           object   { mode: 'off' | 'time' | 'episode' | 'season', … }
 *                              time:    until (timestamp ms), minutes
 *                              episode: setAt — si ferma alla fine dell'episodio in corso
 *                              season:  setAt, season (numero, null finché il player non lo legge)
 *   Stato interno:
 *     streak          number   cambi automatici fatti di fila
 *     lastAutoAt      number   timestamp (ms) dell'ultimo cambio automatico
 *     pendingPlayAt   number   timestamp (ms) dell'ultimo click su "prossimo episodio"
 *     mutedByKW       boolean  l'estensione ha dovuto avviare un episodio senza audio
 *     resume          object   { title, name, seconds, at } — posizione da ripristinare dopo
 *                              che lo streaming bloccato è stato ricaricato
 *     lastReloadAt    number   timestamp (ms) dell'ultima ricarica per streaming bloccato
 *     cinema          boolean  modalità schermo intero tra episodi attiva
 *     cinemaWindowId  number   finestra del browser messa a schermo intero
 *     cinemaPrevState string   stato della finestra prima (normal, maximized)
 *     cinemaSince     number   timestamp (ms) di attivazione della modalità
 */

const KW_DEFAULTS = {
  enabled: true,
  autoNext: true,
  autoPlay: true,
  keepFullscreen: true,
  notifyEnd: true,
  introSkip: true,
  pauseOnHidden: false,
  watchdog: true,
  sleepFade: true,
  countdown: 10,
  skipCredits: 0,
  stopAfter: 0
};

// Dopo questo tempo senza cambi automatici, il conteggio "di fila" riparte da zero.
const KW_STREAK_RESET_MS = 3 * 60 * 60 * 1000;

// Un timer "fine episodio" o "fine stagione" impostato da più di così viene ignorato.
const KW_SLEEP_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Restituisce il timer di spegnimento se è ancora valido, altrimenti null.
 * Un timer a tempo resta valido per un minuto dopo la scadenza, così il player fa
 * in tempo a fermare il video; più tardi viene ignorato (scaduto mentre non si guardava).
 */
function kwActiveSleep(sleep, now = Date.now()) {
  if (!sleep || !sleep.mode || sleep.mode === 'off') return null;
  if (sleep.mode === 'time') return sleep.until > now - 60 * 1000 ? sleep : null;
  return now - (sleep.setAt || 0) < KW_SLEEP_MAX_AGE_MS ? sleep : null;
}

// Secondi in formato m:ss oppure h:mm:ss.
function kwFormatTime(total) {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
