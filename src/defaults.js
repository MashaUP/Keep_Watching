/**
 * Keep_Watching — impostazioni condivise tra background, player, cinema e popup.
 *
 * Chiavi in chrome.storage.local:
 *   Opzioni (modificabili dal popup):
 *     enabled         boolean  interruttore generale (anche con la scorciatoia da tastiera)
 *     autoNext        boolean  passa al prossimo episodio a fine episodio
 *     autoPlay        boolean  avvia il nuovo episodio se si carica in pausa
 *     keepFullscreen  boolean  resta a schermo intero tra un episodio e l'altro
 *     notifyEnd       boolean  notifiche sul desktop (fine episodi, limite raggiunto)
 *     countdown       number   secondi di conto alla rovescia prima del cambio (0 = immediato)
 *     skipCredits     number   secondi prima della fine in cui cambiare episodio (0 = alla fine);
 *                              valori predefiniti nel popup o personalizzati (minuti + secondi)
 *     stopAfter       number   cambi automatici di fila prima di chiedere se continuare (0 = mai)
 *   Stato interno:
 *     streak          number   cambi automatici fatti di fila
 *     lastAutoAt      number   timestamp (ms) dell'ultimo cambio automatico
 *     pendingPlayAt   number   timestamp (ms) dell'ultimo click su "prossimo episodio"
 *     mutedByKW       boolean  l'estensione ha dovuto avviare un episodio senza audio
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
  countdown: 10,
  skipCredits: 0,
  stopAfter: 0
};

// Dopo questo tempo senza cambi automatici, il conteggio "di fila" riparte da zero.
const KW_STREAK_RESET_MS = 3 * 60 * 60 * 1000;
