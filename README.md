# Keep_Watching

<img src="icons/icon128.png" alt="" width="64" align="right">

Estensione per **Chrome** e **Brave** che su StreamingCommunity passa da sola all'episodio successivo quando quello corrente finisce, e lo fa partire con l'audio.

Il player del sito ha un pulsante "prossimo episodio", ma a fine puntata non succede nulla finché non lo si clicca, e il nuovo episodio si carica in pausa. Keep_Watching sistema entrambe le cose.

## Funzionalità

- **Prossimo episodio automatico**: a fine episodio passa al successivo, dopo un **conto alla rovescia annullabile** mostrato sul player. Sull'ultimo episodio disponibile non fa nulla.
- **Avvio del nuovo episodio**: il nuovo episodio parte da solo e con l'audio, anche quando il cambio lo fai tu a mano.
- **Resta a schermo intero**: se guardi a schermo intero, ci resti anche nell'episodio successivo.
- **Salta i titoli di coda**: cambia episodio da 15 secondi a 2 minuti prima della fine, oppure con un anticipo personalizzato in minuti e secondi.
- **Salta l'intro, serie per serie**: segni la fine dell'intro una volta dal player ("Fine intro qui") e dagli episodi successivi viene saltata da sola, con la possibilità di annullare.
- **Titoli di coda per serie**: con "Inizio titoli qui" il cambio episodio avviene al momento giusto per quella serie.
- **Barra di pulsanti sul player**: "Salta intro", "+60 s", "Fine intro qui", "Inizio titoli qui" e "Stop a fine episodio", visibili quando muovi il mouse sul video.
- **Timer di spegnimento**: ferma il video dopo 15–90 minuti, alla fine dell'episodio o alla fine della stagione, abbassando il volume negli ultimi 30 secondi.
- **Riparte se lo streaming si blocca**: prima un piccolo salto in avanti, poi ricarica l'episodio dal punto in cui eri.
- **Pausa quando cambi scheda** (facoltativa): riprende quando torni sul video.
- **Chiedi se continuare dopo N episodi**: dopo un certo numero di episodi di fila chiede se andare avanti, utile se ti addormenti.
- **Notifiche sul desktop**: quando la serie è finita o quando serve una tua risposta.
- **Interruttore rapido**: attivi o sospendi l'estensione con Alt+Shift+K; il badge sull'icona mostra "OFF" quando è sospesa.
- **Dominio che cambia**: continua a funzionare quando il sito cambia dominio (`.fun`, `.xyz` e così via).

## Installazione

Il modo più rapido è usare lo zip pronto nella radice del repository, **`Keep_Watching-1.3.0.zip`**. Contiene la cartella `Keep_Watching` con i soli file dell'estensione.

1. Scarica `Keep_Watching-1.3.0.zip` ed estrailo con "Estrai qui": ottieni la cartella `Keep_Watching`. Tienila: il browser carica l'estensione da lì ogni volta.
2. Apri `chrome://extensions` (su Brave `brave://extensions`).
3. Attiva **Modalità sviluppatore** in alto a destra.
4. Clicca **Carica estensione non pacchettizzata** e seleziona la cartella `Keep_Watching`, quella che contiene `manifest.json`.

Al primo avvio il browser crea dentro la cartella una sottocartella `_metadata`: è normale, contiene una versione precompilata delle regole di rete.

In alternativa si può clonare il repository e selezionare direttamente la sua cartella: funziona allo stesso modo.

In fase di installazione il browser avvisa che l'estensione può leggere i dati su tutti i siti. Succede perché il sito cambia dominio e l'estensione si aggancia al percorso delle pagine (`/iframe/`, `/watch/`), non a un dominio fisso. In pratica agisce solo sull'iframe del player di vixcloud.co. I dettagli sono nella sezione [Permessi](#permessi).

### Aggiornare

Estrai lo zip della nuova versione al posto della cartella vecchia (o fai `git pull`), poi in `chrome://extensions` premi l'icona di ricarica sulla scheda di Keep_Watching e ricarica la pagina del sito. Se la nuova versione chiede permessi nuovi, rimuovi l'estensione e caricala di nuovo.

## Uso

Apri un episodio e premi play almeno una volta: senza un tuo primo click il browser non lascia partire l'audio da solo. Da lì in poi fa tutto l'estensione.

Le opzioni si cambiano cliccando l'icona di Keep_Watching nella barra del browser e vengono salvate subito.

| Opzione | Effetto | Predefinito |
|---|---|---|
| Estensione attiva | Interruttore generale (anche con Alt+Shift+K) | Attivo |
| Prossimo episodio automatico | Passa al successivo a fine episodio | Attivo |
| Avvia il nuovo episodio | Fa partire il nuovo episodio se si carica in pausa | Attivo |
| Resta a schermo intero | Mantiene lo schermo intero tra un episodio e l'altro | Attivo |
| Conto alla rovescia | Secondi prima del cambio, con "Annulla" e "Vai ora" | 10 secondi |
| Salta i titoli di coda | Cambia episodio prima della fine: valori pronti fino a 2 minuti, oppure **Personalizzato…** con minuti e secondi. Le serie con i titoli segnati usano il loro valore | No |
| Chiedi se continuare dopo | Dopo N episodi di fila chiede se continuare | Mai |
| Timer di spegnimento | Tra 15–90 minuti, alla fine dell'episodio o della stagione | Disattivato |
| Abbassa il volume prima | Dissolvenza negli ultimi 30 secondi prima che il timer fermi il video | Attivo |
| Salta l'intro | Salto automatico nelle serie in cui hai segnato la fine dell'intro | Attivo |
| Pausa quando cambi scheda | Pausa quando la scheda viene nascosta, ripresa al ritorno | Disattivato |
| Riparti se lo streaming si blocca | Salto avanti e poi ricarica dal punto in cui eri | Attivo |
| Notifiche sul desktop | Fine episodi, limite, timer, streaming bloccato | Attivo |

Nel menu c'è anche l'elenco delle **serie salvate**, con intro e titoli segnati e il pulsante per rimuoverle.

**Barra sul player.** Muovendo il mouse sul video compare in alto a destra una barra che sparisce dopo 3 secondi:

| Pulsante | Quando compare | Cosa fa |
|---|---|---|
| Salta intro | Prima della fine dell'intro segnata | Salta alla fine dell'intro |
| +60 s | Primi 3 minuti, se l'intro non è segnata | Avanti di un minuto |
| Fine intro qui | Primi 10 minuti | Segna la fine dell'intro per questa serie |
| Inizio titoli qui | Ultimi 10 minuti | Segna l'inizio dei titoli per questa serie (vale come "secondi prima della fine") |
| Stop a fine episodio | Sempre | Attiva o disattiva il timer "fine episodio" |

L'intro non viene saltata quando l'episodio riparte da un punto preciso, per esempio da "continua a guardare" del sito o dopo una ricarica.

**Schermo intero tra episodi.** Il browser concede lo schermo intero vero solo dopo un click, e a ogni episodio il player viene ricreato. Per questo, al cambio episodio, l'estensione mette a schermo intero la finestra del browser (come F11) e allarga il player a tutta la finestra: il risultato è lo stesso. Per uscire premi **Esc** oppure il pulsante schermo intero del player.

**Scorciatoia.** Alt+Shift+K si può cambiare da `brave://extensions/shortcuts` (o `chrome://extensions/shortcuts`).

L'estensione funziona anche con la finestra ridotta a icona. Se in quel caso il browser non lascia partire il nuovo episodio, l'avvio viene ripetuto appena torni sulla scheda.

Il conteggio di "Chiedi se continuare dopo" riparte da zero dopo 3 ore senza cambi automatici, rispondendo alla domanda, oppure con il pulsante **Azzera** nel menu.

## Come funziona

La pagina del sito è formata da tre livelli annidati:

```
<dominio>/it/watch/<id>                   pagina principale (non si ricarica tra un episodio e l'altro)
 └─ <dominio>/it/iframe/<id>?episode_id=… iframe intermedio (si ricarica a ogni episodio)
     └─ vixcloud.co/embed/<id>?token=…     player JW Player (nuovo a ogni episodio)
```

- `src/player.js` gira nel player. Rileva la fine dell'episodio, mostra il conto alla rovescia o la domanda sul limite, clicca "prossimo episodio" e, nel nuovo episodio, lo avvia se è rimasto in pausa.
- `src/toolbar.js` disegna la barra di pulsanti sul player.
- `src/recovery.js` ricarica l'episodio dal punto giusto quando lo streaming si blocca.
- `src/cinema.js` gira nelle pagine del sito e allarga il player a tutta la finestra durante lo schermo intero tra episodi.
- `src/background.js` gestisce badge, scorciatoia, notifiche e schermo intero della finestra.
- `src/autoplay-permission.js` e `rules.json` fanno caricare il player con il permesso `allow="autoplay"`, che il sito non concede e senza il quale il browser blocca l'audio.

La spiegazione completa, i punti fragili e la guida alla risoluzione dei problemi sono in **[docs/MANUTENZIONE.md](docs/MANUTENZIONE.md)**.

## Permessi

| Permesso | Perché serve |
|---|---|
| `storage` | Salvare le opzioni e passare informazioni da un episodio al successivo |
| `notifications` | Notifiche sul desktop a fine episodi e al limite di episodi |
| `declarativeNetRequest` | Bloccare il primo caricamento del player, che parte senza permesso di autoplay, così che l'estensione lo rifaccia con il permesso |
| Script su `*/iframe/*` e `*/watch/*` | Aggiungere il permesso di autoplay all'iframe del player, su qualunque dominio usi il sito |
| Script su `vixcloud.co/embed/*` | Controllare il player |

L'estensione non raccoglie né invia dati: non fa richieste di rete proprie e usa solo lo spazio di archiviazione locale del browser.

## Struttura del repository

```
Keep_Watching-1.3.0.zip     pacchetto pronto da installare (cartella Keep_Watching con i soli file dell'estensione)
manifest.json               configurazione dell'estensione (Manifest V3)
rules.json                  regola di rete per il permesso di autoplay
src/
  background.js             badge, scorciatoia, notifiche, schermo intero della finestra
  cinema.js                 player a tutta finestra tra un episodio e l'altro
  defaults.js               opzioni predefinite e chiavi di archiviazione
  panel.js                  riquadro sul player (conto alla rovescia e domande)
  toolbar.js                barra di pulsanti sul player
  recovery.js               ricarica dell'episodio quando lo streaming si blocca
  player.js                 logica nel player: cambio episodio, intro, timer, streaming bloccato
  autoplay-permission.js    permesso di autoplay sull'iframe del player
  popup/                    menu dell'icona (HTML, CSS, JS)
icons/                      icone 16, 32, 48, 128 px
tools/
  make_icons.py             rigenera le icone
  package.sh / package.ps1  crea lo zip di installazione e aggiorna il README
docs/
  MANUTENZIONE.md           guida tecnica e risoluzione dei problemi
```

## Note

Progetto personale, non affiliato a StreamingCommunity né a JW Player. L'estensione automatizza soltanto i controlli del player, senza modificare i contenuti del sito.

## Licenza

[MIT](LICENSE)
