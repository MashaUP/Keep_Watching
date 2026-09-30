/**
 * Keep_Watching — impostazioni condivise tra player.js e il popup.
 *
 * Chiavi in chrome.storage.local:
 *   Opzioni (modificabili dal popup):
 *     autoNext     boolean  clicca "prossimo episodio" a fine episodio
 *     autoPlay     boolean  avvia il nuovo episodio se si carica in pausa
 *     skipCredits  number   secondi prima della fine in cui cambiare episodio (0 = alla fine)
 *     stopAfter    number   massimo di cambi automatici di fila (0 = nessun limite)
 *   Stato interno (scritto da player.js):
 *     streak        number  cambi automatici fatti di fila
 *     lastAutoAt    number  timestamp (ms) dell'ultimo cambio automatico
 *     pendingPlayAt number  timestamp (ms) dell'ultimo click su "prossimo episodio"
 *     mutedByKW     boolean l'estensione ha dovuto avviare un episodio senza audio
 */

const KW_DEFAULTS = {
  autoNext: true,
  autoPlay: true,
  skipCredits: 0,
  stopAfter: 0
};

// Dopo questo tempo senza cambi automatici, il conteggio "di fila" riparte da zero.
const KW_STREAK_RESET_MS = 3 * 60 * 60 * 1000;
