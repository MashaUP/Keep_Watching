# Keep_Watching

Estensione per Brave e Chrome che su StreamingCommunity passa da sola all'episodio successivo quando quello corrente finisce, e lo fa partire con l'audio. Salta l'intro e i titoli di coda serie per serie, ha un timer di spegnimento e fa ripartire lo streaming quando si blocca.

Versione 1.3.0

> **Importante:** il browser lascia partire l'audio da solo solo dopo un tuo click sulla pagina. Apri l'episodio e premi play una volta: da lì in poi fa tutto l'estensione.

## Come funziona

- **Prossimo episodio automatico:** a fine episodio l'estensione preme il pulsante "prossimo episodio" del player. Sull'ultimo episodio disponibile non fa nulla.
- **Conto alla rovescia:** prima del cambio compare sul player un riquadro "Prossimo episodio di …" con la barra che si consuma e i pulsanti **Annulla** e **Vai ora**. Si vede anche a schermo intero.
- **Il nuovo episodio parte da solo e con l'audio**, anche quando il cambio lo fai tu a mano. Il sito non darebbe al player il permesso di farlo: l'estensione glielo aggiunge.
- **Salta l'intro, serie per serie:** la prima volta premi **Fine intro qui** sul player; dagli episodi successivi della serie l'intro viene saltata da sola, con un riquadro "Intro saltata" e il pulsante **Annulla**.
- **Titoli di coda per serie:** con **Inizio titoli qui** il cambio episodio avviene quando iniziano i titoli di quella serie. Per le altre serie vale l'impostazione generale: da 15 secondi a 2 minuti prima della fine, oppure un anticipo a piacere in minuti e secondi.
- **Barra di pulsanti sul player:** muovendo il mouse sul video compaiono in alto a destra **Salta intro**, **+60 s**, **Fine intro qui**, **Inizio titoli qui** e **Stop a fine episodio**.
- **Timer di spegnimento:** il video si ferma tra 15, 30, 45, 60 o 90 minuti, alla fine dell'episodio o alla fine della stagione. Negli ultimi 30 secondi il volume si abbassa piano.
- **Chiedi se continuare dopo N episodi:** dopo 1, 2, 3, 5 o 10 episodi di fila il player chiede **Continua** o **Basta così**. Utile se ti addormenti.
- **Resta a schermo intero:** se guardi a schermo intero, ci resti anche nell'episodio successivo. Si esce con **Esc**.
- **Se lo streaming si blocca:** dopo 12 secondi fermo l'estensione fa un salto di 1 secondo; se non basta, ricarica l'episodio e lo riporta al secondo in cui eri.
- **Pausa quando cambi scheda** (facoltativa): il video si ferma e riparte quando torni.
- **Notifiche sul desktop:** serie finita, limite di episodi raggiunto, timer di spegnimento, streaming bloccato. Toccando la notifica si torna alla scheda.
- **Interruttore rapido:** **Alt+Shift+K** attiva o sospende l'estensione; l'icona mostra **OFF** quando è sospesa e, per esempio, **2/3** quando sta contando gli episodi di fila.
- **Il dominio del sito può cambiare:** l'estensione non dipende dal dominio principale (`.fun`, `.xyz`…), ma dal percorso delle pagine e dal dominio del player.

Funziona su Brave e Chrome per computer. Non raccoglie né invia dati: usa solo lo spazio del browser.

## Cosa ti serve

- Brave o Chrome sul computer.
- Un account GitHub, solo per conservare il progetto (va bene un repository privato).

L'installazione si fa una volta sola e richiede un paio di minuti.

## 1. Carica il progetto su GitHub

1. Crea un nuovo repository, per esempio `Keep_Watching`. Può essere **privato**: l'estensione non usa GitHub Pages.
2. Carica **il contenuto** della cartella `Keep_Watching_GitHub` nella radice del repository: `manifest.json`, `Keep_Watching-1.3.0.zip` e le cartelle devono stare al primo livello.

## 2. Installa l'estensione

### 2.1 Estrai lo zip

1. Scarica `Keep_Watching-1.3.0.zip` (dal repository, oppure dalla cartella del progetto).
2. Estrailo con **Estrai qui**: ottieni la cartella `Keep_Watching`, con dentro `manifest.json`.
3. Mettila in un posto dove resta: il browser carica l'estensione da lì ogni volta. Se la cancelli, l'estensione smette di funzionare.

### 2.2 Carica l'estensione nel browser

1. Apri `brave://extensions` (su Chrome `chrome://extensions`).
2. Attiva **Modalità sviluppatore** in alto a destra.
3. Clicca **Carica estensione non pacchettizzata** e seleziona la cartella `Keep_Watching`.
4. Clicca l'icona del puzzle nella barra del browser e fissa Keep_Watching con la puntina: così il menu e il badge sono sempre a portata di mano.

Al primo avvio il browser crea dentro la cartella una sottocartella `_metadata`: è normale, contiene una copia precompilata di `rules.json`.

### 2.3 Permessi

Durante l'installazione il browser avvisa che l'estensione può **leggere e modificare i dati su tutti i siti**. Succede perché il sito cambia dominio, quindi l'estensione si aggancia al percorso delle pagine (`/watch/`, `/iframe/`) e non a un dominio fisso. In pratica agisce solo sulle pagine degli episodi e sul player di vixcloud.co.

| Permesso | Perché serve |
|---|---|
| `storage` | Salvare le opzioni, le serie e il timer, e passare le informazioni da un episodio al successivo |
| `notifications` | Notifiche sul desktop |
| `declarativeNetRequest` | Bloccare il primo caricamento del player, che parte senza permesso di autoplay, così che l'estensione lo rifaccia con il permesso |
| Pagine `*/watch/*` e `*/iframe/*` | Dare al player il permesso di autoplay, schermo intero tra episodi, ricarica dello streaming bloccato |
| Player `vixcloud.co/embed/*` | Controllare il player |

### 2.4 Scorciatoia

Apri `brave://extensions/shortcuts` (su Chrome `chrome://extensions/shortcuts`) e controlla che **Attiva o sospendi Keep_Watching** abbia **Alt+Shift+K**. Il browser non la assegna se è già usata da un'altra estensione: in quel caso sceglila tu.

### 2.5 Verifica

1. Apri un episodio, apri gli strumenti per sviluppatori dal menu del browser (**Altri strumenti › Strumenti per sviluppatori**) e, nella scheda **Sources**, premi **Ctrl+F8**: senza questo passaggio il player si chiude con "Connessione negata da vixcloud.co" (vedi **Problemi comuni**).
2. Nella scheda **Console** scrivi `Keep_Watching` nel campo filtro e ricarica la pagina.
3. Deve comparire `[Keep_Watching] Player caricato con permesso: autoplay; fullscreen`. Se c'è, l'estensione è attiva sul player.

## 3. Aggiorna a una nuova versione

1. Estrai lo zip della nuova versione al posto della cartella `Keep_Watching` vecchia.
2. In `brave://extensions` premi l'icona di ricarica sulla scheda di Keep_Watching.
3. Ricarica la pagina dell'episodio.

Se la nuova versione chiede permessi nuovi (la 1.2.0, per esempio, ha aggiunto le notifiche), rimuovi l'estensione e caricala di nuovo dal passo 2.2. Le opzioni salvate restano solo se ricarichi l'estensione; rimuovendola si perdono, comprese le serie salvate.

## 4. La visione

1. Apri un episodio sul sito e premi play.
2. Lascia fare all'estensione: a fine episodio compare il conto alla rovescia e poi parte il prossimo.
3. La prima volta che guardi una serie, quando finisce l'intro muovi il mouse sul video e premi **Fine intro qui**. Verso la fine, quando iniziano i titoli, premi **Inizio titoli qui**. Da lì in poi, per quella serie, ci pensa l'estensione.
4. Se pensi di addormentarti, apri il menu dell'estensione e scegli un **timer di spegnimento**, oppure premi **Stop a fine episodio** sul player.

### Il menu dell'estensione

Si apre cliccando l'icona di Keep_Watching. Le modifiche valgono subito, anche sull'episodio in corso.

| Opzione | Cosa fa | Di serie |
|---|---|---|
| **Estensione attiva** | Interruttore generale (anche con Alt+Shift+K) | Attivo |
| **Prossimo episodio automatico** | Passa al successivo a fine episodio | Attivo |
| **Avvia il nuovo episodio** | Fa partire il nuovo episodio se si carica in pausa | Attivo |
| **Resta a schermo intero** | Mantiene lo schermo intero tra un episodio e l'altro | Attivo |
| **Conto alla rovescia** | 5, 10, 15 o 20 secondi prima del cambio, oppure cambio immediato | 10 secondi |
| **Salta i titoli di coda** | 15, 30, 60, 90 o 120 secondi prima della fine, oppure **Personalizzato…** con minuti e secondi | No |
| **Chiedi se continuare dopo** | 1, 2, 3, 5 o 10 episodi di fila | Mai |
| **Timer di spegnimento** | Tra 15, 30, 45, 60 o 90 minuti, alla fine dell'episodio o della stagione | Disattivato |
| **Abbassa il volume prima** | Dissolvenza negli ultimi 30 secondi prima che il timer fermi il video | Attivo |
| **Salta l'intro** | Salto automatico nelle serie in cui hai segnato la fine dell'intro | Attivo |
| **Pausa quando cambi scheda** | Pausa quando la scheda viene nascosta, ripresa al ritorno | Disattivato |
| **Riparti se lo streaming si blocca** | Salto in avanti e poi ricarica dal punto in cui eri | Attivo |
| **Notifiche sul desktop** | Serie finita, limite di episodi, timer di spegnimento | Attivo |

Sotto **Intro delle serie** c'è l'elenco delle serie salvate, con la fine dell'intro e l'inizio dei titoli di ognuna, e **Rimuovi** per cancellarne una.

### La barra sul player

Muovendo il mouse sul video compare in alto a destra una barra di pulsanti. Sparisce dopo 3 secondi senza movimento, e resta finché il mouse è sopra.

| Pulsante | Quando compare | Cosa fa |
|---|---|---|
| **Salta intro** | Prima della fine dell'intro segnata | Salta alla fine dell'intro |
| **+60 s** | Nei primi 3 minuti, se non c'è un'intro da saltare | Avanti di un minuto |
| **Fine intro qui** | Nei primi 10 minuti | Segna la fine dell'intro per questa serie |
| **Inizio titoli qui** | Negli ultimi 10 minuti | Segna l'inizio dei titoli per questa serie; da quel punto parte il cambio episodio (con il conto alla rovescia, se attivo) |
| **Stop a fine episodio** | Sempre | Attiva o disattiva il timer "fine episodio" (con ✓ quando è attivo) |

Dopo **Fine intro qui** e **Inizio titoli qui** il pulsante conferma per un attimo il valore salvato (per esempio "Intro fino a 1:32 ✓"). Se premi **Fine intro qui** nei primi 5 secondi, o **Inizio titoli qui** lasciando meno di un minuto di episodio, dice **Troppo presto** e non salva niente.

L'intro e i titoli si salvano per **titolo della serie**: valgono per tutti gli episodi e tutte le stagioni. I titoli si salvano come "secondi prima della fine", così funzionano anche con episodi di durata diversa.

### Conto alla rovescia e limite di episodi

- **Annulla** chiude il riquadro: l'episodio resta finito e non succede altro. Se torni indietro e lo riguardi fino alla fine, il conto alla rovescia ricompare.
- **Vai ora** passa subito al prossimo episodio.
- Con **Chiedi se continuare dopo**, raggiunto il numero di episodi di fila compare **Hai visto 3 episodi di fila** con **Basta così** e **Continua**. Entrambi azzerano il conteggio. Se la scheda è nascosta arriva anche una notifica.
- Il conteggio si azzera da solo dopo 3 ore senza cambi automatici, oppure con **Azzera** nel menu.

### Timer di spegnimento

- **Tra N minuti:** allo scadere il video va in pausa e compare **Riprendi**. Il menu mostra a che ora si ferma. Un timer scaduto mentre non stavi guardando viene ignorato.
- **Alla fine dell'episodio:** invece di cambiare episodio, il video si ferma. Il riquadro propone **Prossimo episodio** se vuoi continuare. Se hai segnato i titoli della serie, si ferma all'inizio dei titoli. Lo stesso timer si attiva dalla barra con **Stop a fine episodio**.
- **Alla fine della stagione:** gli episodi della stagione in corso continuano normalmente; quando parte il primo episodio della stagione dopo, il video viene fermato e compare **Guarda comunque**.
- **Volume:** con **Abbassa il volume prima** il volume scende piano negli ultimi 30 secondi e torna normale quando il video si ferma.
- Ogni timer si spegne da solo dopo essere scattato. "Fine episodio" e "fine stagione" scadono dopo 12 ore se non scattano.

### Schermo intero tra un episodio e l'altro

Il browser concede lo schermo intero vero solo dopo un tuo click, e a ogni episodio il player viene ricreato. Per questo, se al cambio episodio stai guardando a schermo intero, l'estensione mette a schermo intero la **finestra** del browser (come F11) e allarga il player a tutta la finestra: il risultato è lo stesso.

Per uscire premi **Esc** oppure il pulsante schermo intero del player. La modalità si chiude da sola anche a fine serie, con **Basta così**, uscendo dalla pagina dell'episodio o sospendendo l'estensione.

### Se lo streaming si blocca

1. Il video risulta in riproduzione ma non avanza per 12 secondi: l'estensione fa un salto di 1 secondo in avanti, che spesso basta a farlo ripartire.
2. Se dopo altri 12 secondi è ancora fermo, ricarica l'episodio dal sito e lo riporta al secondo in cui suonava.
3. Se si blocca di nuovo entro 3 minuti, non ricarica più: arriva una notifica e conviene ricaricare la pagina a mano.

### Finestra ridotta a icona e altre schede

L'estensione funziona anche con la finestra ridotta a icona o con un'altra scheda in primo piano. Se il browser non lascia partire il nuovo episodio mentre la scheda è nascosta, l'avvio viene ripetuto appena torni sulla scheda.

Con **Pausa quando cambi scheda** succede il contrario: il video si ferma quando la scheda viene nascosta e riparte quando torni, solo se l'aveva fermato l'estensione.

### Notifiche e badge

- **Serie finita** ("Brothers: episodi finiti"), **limite di episodi** e **fine stagione** con la scheda nascosta: arrivano se **Notifiche sul desktop** è attivo.
- **Pulsante non trovato** e **streaming bloccato**: arrivano sempre, perché segnalano un problema. "Pulsante non trovato" vuol dire che il player dice che c'è un episodio successivo ma il pulsante non si trova: quasi certamente il sito ha cambiato la barra dei controlli.
- Toccando una notifica si torna alla scheda dell'episodio.
- Il **badge** sull'icona mostra **OFF** quando l'estensione è sospesa e **2/3** quando sta contando gli episodi di fila.

## Pubblicare una nuova versione

1. Aumenta `"version"` in `manifest.json`.
2. Aggiungi una sezione in `CHANGELOG.md`.
3. Prova la nuova versione con la checklist in `docs/MANUTENZIONE.md`.
4. Crea lo zip di installazione: su Windows `powershell -ExecutionPolicy Bypass -File tools/package.ps1`, su Linux, macOS o Git Bash `sh tools/package.sh`. Nella radice viene creato `Keep_Watching-<versione>.zip`, lo zip della versione precedente viene eliminato e il nome dello zip in questo README viene aggiornato.
5. Carica tutto su GitHub, zip compreso.

La guida tecnica (come è fatto il sito, perché l'estensione funziona così, punti fragili, debug, comandi diagnostici) è in **[docs/MANUTENZIONE.md](docs/MANUTENZIONE.md)**.

## Problemi comuni

- **"Connessione negata da vixcloud.co" aprendo gli strumenti per sviluppatori:** il player ha una protezione contro gli strumenti per sviluppatori. Nella scheda **Sources** premi **Ctrl+F8** e ricarica la pagina. Anche F12 viene bloccato: apri gli strumenti dal menu del browser.
- **Il player mostra una pagina di errore o non si carica:** probabilmente il sito ha cambiato il percorso delle pagine (`/watch/`, `/iframe/`) e l'estensione non riesce più a dare il permesso al player. Sospendi l'estensione (Alt+Shift+K) per guardare e vedi `docs/MANUTENZIONE.md`.
- **A fine episodio non succede niente:** controlla che **Estensione attiva** e **Prossimo episodio automatico** siano accesi e che l'icona non mostri **OFF**. Se arriva la notifica **pulsante non trovato**, il sito ha cambiato la barra del player.
- **Il nuovo episodio parte muto:** il browser ha rifiutato l'avvio con l'audio e l'estensione l'ha fatto partire senza. Succede se non hai mai cliccato sulla pagina: premi play a mano la prima volta.
- **Il video parte muto anche avviandolo a mano:** il player ricorda lo stato "muto". Riattiva l'audio una volta dal controllo del volume del player.
- **Il volume è rimasto basso dopo il timer di spegnimento:** la pagina è stata chiusa durante la dissolvenza e il player ha ricordato il volume. Rialzalo una volta dal player.
- **L'intro non viene saltata:** l'opzione **Salta l'intro** è spenta, l'intro di quella serie non è segnata (controlla l'elenco nel menu) oppure l'episodio è ripartito da un punto preciso, per esempio da "continua a guardare" del sito.
- **La barra di pulsanti non compare:** muovi il mouse sopra il video. **Fine intro qui** e **Inizio titoli qui** compaiono solo nei primi e negli ultimi 10 minuti.
- **Sono rimasto bloccato a schermo intero:** premi **Esc**, oppure **F11**.
- **La scorciatoia Alt+Shift+K non fa niente:** è già usata da un'altra estensione. Assegnala in `brave://extensions/shortcuts`.
- **Non arrivano le notifiche:** controlla **Notifiche sul desktop** nel menu e, in Windows, **Impostazioni › Sistema › Notifiche** per Brave.
- **Nella console compare "A listener indicated an asynchronous response…":** non viene da Keep_Watching, i cui messaggi iniziano sempre con `[Keep_Watching]`. Viene da un'altra estensione installata.
- **Dopo l'aggiornamento l'estensione non cambia:** ricarica l'estensione in `brave://extensions` e poi la pagina dell'episodio. Se la nuova versione ha permessi nuovi, rimuovila e caricala di nuovo.

## Struttura dei file

```
Keep_Watching-1.3.0.zip      pacchetto da installare: la cartella Keep_Watching con i soli file dell'estensione
manifest.json                configurazione dell'estensione (Manifest V3)
rules.json                   regola di rete: blocca il primo caricamento del player senza permesso di autoplay
src/background.js            badge, scorciatoia, notifiche, schermo intero della finestra
src/defaults.js              opzioni di serie e tutte le chiavi salvate nel browser
src/player.js                player: cambio episodio, intro e titoli, timer, streaming bloccato, avvio
src/panel.js                 riquadro sul player (conto alla rovescia e domande)
src/toolbar.js               barra di pulsanti sul player
src/autoplay-permission.js   pagine del sito: permesso di autoplay al player
src/cinema.js                pagine del sito: player a tutta finestra tra un episodio e l'altro
src/recovery.js              pagine del sito: ricarica dell'episodio quando lo streaming si blocca
src/popup/                   menu dell'icona (HTML, CSS, JS)
icons/                       icone 16, 32, 48 e 128 px
tools/make_icons.py          rigenera le icone (serve Pillow)
tools/package.ps1            crea lo zip di installazione su Windows e aggiorna il README
tools/package.sh             lo stesso per Linux, macOS e Git Bash
docs/MANUTENZIONE.md         guida tecnica, debug, punti fragili e checklist di test
CHANGELOG.md                 novità di ogni versione
```

L'estensione non usa librerie esterne e non fa richieste di rete proprie.

## Donazioni

Keep_Watching è gratis. Se ti è utile, puoi offrire un caffè su Ko-fi: https://ko-fi.com/mashaup

## Crediti e licenze

- Codice: licenza MIT (file `LICENSE`).
- Icona disegnata da `tools/make_icons.py`, nel verde del player del sito.
- Progetto personale, non affiliato a StreamingCommunity né a JW Player. L'estensione automatizza i controlli del player senza modificare i contenuti del sito.
