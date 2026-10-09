# Changelog

Tutte le modifiche rilevanti del progetto sono elencate qui.
Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e le versioni seguono il [Semantic Versioning](https://semver.org/lang/it/).

## [1.3.0] - 2026-10-09

### Aggiunto
- **Salto intro per serie**: con il pulsante "Fine intro qui" sul player si segna la fine dell'intro; negli episodi successivi della serie viene saltata da sola, con un riquadro "Intro saltata" e il pulsante "Annulla". Non scatta se l'episodio riparte da un punto preciso (`minute=` o ricarica).
- **Titoli di coda per serie**: "Inizio titoli qui" salva per la serie quanti secondi prima della fine iniziano i titoli; ha la precedenza sul valore generale.
- **Barra di pulsanti sul player** (`src/toolbar.js`): "Salta intro", "+60 s", "Fine intro qui", "Inizio titoli qui", "Stop a fine episodio". Compare muovendo il mouse sul video.
- **Timer di spegnimento**: dopo 15–90 minuti, alla fine dell'episodio o alla fine della stagione, con dissolvenza del volume negli ultimi 30 secondi (opzionale). Il volume viene ripristinato a video fermo.
- **Streaming bloccato**: se il video non avanza per 12 secondi viene fatto un salto di 1 secondo; se non basta, l'episodio viene ricaricato tramite l'iframe del sito con `minute=` e riportato al secondo in cui suonava (`src/recovery.js`). Se si blocca di nuovo entro 3 minuti arriva una notifica.
- **Pausa quando cambi scheda** (facoltativa, disattivata di default).
- Nel menu: sezioni, timer di spegnimento con orario di fine, elenco delle serie salvate con "Rimuovi".

## [1.2.1] - 2026-10-05

Versione di manutenzione: nessuna funzione nuova, comportamento invariato.

### Modificato
- Il riquadro sul player (conto alla rovescia e domande) è stato spostato da `player.js` nel nuovo file `src/panel.js`.
- `player.js`: dati dell'episodio letti una sola volta dall'URL; decodifica del titolo con `TextDecoder` al posto della funzione deprecata `escape()`; avvio del nuovo episodio semplificato (un solo percorso per il tentativo con e senza audio); listener degli eventi video unificati; plurali corretti nei messaggi ("1 episodio").
- `autoplay-permission.js` interviene solo sull'iframe del player, e non più sugli iframe senza URL di altri siti con `/watch/` o `/iframe/` nel percorso.
- `cinema.js` controlla l'URL della pagina solo mentre la modalità cinema è attiva, invece che ogni secondo in ogni momento.
- `background.js`: avvio del browser e installazione condividono la stessa funzione.
- CSS del menu riordinato, senza regole duplicate.
- Descrizione dell'estensione aggiornata alle funzioni attuali.
- `tools/package.sh` e `tools/package.ps1` aggiornano da soli il nome dello zip nel README; `package.ps1` legge e scrive i file in UTF-8 anche su Windows PowerShell 5.1.

## [1.2.0] - 2026-10-05

### Aggiunto
- **Conto alla rovescia annullabile** prima del cambio episodio: un riquadro sul player, visibile anche a schermo intero, con i pulsanti "Annulla" e "Vai ora". Durata da 5 a 20 secondi, oppure cambio immediato.
- **Interruttore generale** in cima al menu e **scorciatoia da tastiera** (predefinita Alt+Shift+K) per attivare o sospendere l'estensione.
- **Badge sull'icona**: "OFF" quando l'estensione è sospesa, "2/3" durante un limite di episodi.
- **Notifiche sul desktop** quando non ci sono altri episodi, quando si raggiunge il limite con la scheda nascosta e quando il pulsante "prossimo episodio" non viene trovato pur esistendo un episodio successivo (segno che il sito è cambiato). Cliccando la notifica si torna alla scheda.
- **Resta a schermo intero tra un episodio e l'altro** (attivabile dal menu): se si guarda a schermo intero, al cambio episodio la finestra del browser passa a schermo intero e il player la occupa tutta. Si esce con Esc o con il pulsante schermo intero del player.

### Modificato
- "Fermati dopo" diventa **"Chiedi se continuare dopo"**: al raggiungimento del limite un riquadro sul player chiede se passare al prossimo episodio ("Continua") o fermarsi ("Basta così"), invece di fermarsi in silenzio.
- Nuovo service worker (`src/background.js`) e nuovo script `src/cinema.js`; nuovo permesso `notifications`.

## [1.1.0] - 2026-10-02

### Aggiunto
- Opzione **Personalizzato…** in "Salta i titoli di coda": si sceglie con minuti e secondi quanto prima della fine cambiare episodio. Un anticipo più lungo dell'episodio viene ignorato.
- Nei log, lo stato della scheda (`[scheda visibile]` / `[scheda nascosta]`) nei momenti chiave del cambio episodio.

### Modificato
- Lo zip di installazione contiene ora la cartella `Keep_Watching/`: estraendolo si ottiene direttamente la cartella da caricare nel browser.
- L'attesa del player nel nuovo episodio usa gli eventi del video invece di un ciclo di timer, che Chrome rallenta nelle schede nascoste.
- Finestra ridotta a icona: se il nuovo episodio non parte o viene rimesso in pausa mentre la scheda è nascosta, l'estensione riprova l'avvio appena la scheda torna visibile.
- `.gitignore` esclude la cartella `_metadata/` creata dal browser.

## [1.0.0] - 2026-09-30

Prima versione pubblicata.

### Aggiunto
- Passaggio automatico all'episodio successivo a fine episodio, con click sul pulsante "prossimo episodio" del player.
- Avvio automatico con audio del nuovo episodio, anche dopo un click manuale su "prossimo episodio".
- Permesso di autoplay per l'iframe del player (`allow="autoplay"`), senza il quale il browser bloccava l'audio.
- Menu dall'icona con le opzioni: prossimo episodio automatico, avvio del nuovo episodio, salta i titoli di coda (da 15 secondi a 2 minuti prima della fine), fermati dopo N episodi di fila.
- Funzionamento indipendente dal dominio principale del sito, che cambia periodicamente.
- Icone e script di utilità in `tools/` (rigenerazione icone, creazione del pacchetto zip).
