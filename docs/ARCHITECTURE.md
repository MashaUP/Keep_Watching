# Keep Watching — architettura

Moduli, flussi principali e dati salvati. Come è fatto il sito e cosa può rompersi: [SITE_NOTES.md](SITE_NOTES.md). Test: [TEST_PLAN.md](TEST_PLAN.md). Rilascio: [RELEASE.md](RELEASE.md).

## File del repository

```
Keep_Watching-x.y.z.zip      pacchetto da installare (cartella Keep_Watching/), scritto da npm run package
version.json                 ultima versione pubblicata, letta da "Cerca aggiornamento"
links.json                   collegamenti aggiornabili senza nuova versione (letti dal menu)
manifest.json                configurazione dell'estensione (Manifest V3), fonte unica della versione
rules.json                   regola di rete: blocca il primo caricamento del player senza permesso di autoplay
src/background.js            badge, scorciatoie, notifiche, schermo intero, statistiche, cronologia, Verifica tutto, migrazione
src/defaults.js              opzioni di serie, validazione, profili, categorie di popup, scorciatoie, link tecnici
src/hosts.js                 domini del player supportati (da aggiornare insieme a manifest e rules.json)
src/lib/stats.js             statistiche: misura, sessioni, riepiloghi, CSV e JSON, importazione
src/lib/updates.js           controllo degli aggiornamenti e confronto delle versioni
src/lib/health.js            stati del player, tentativi, verifiche, cronologia eventi
src/lib/links.js             collegamenti ufficiali e configurazione remota
src/player.js                player: cambio episodio, intro e titoli, timer, salto avanti, streaming bloccato, avvio
src/panel.js, toolbar.js, guide.js   riquadri, barra di pulsanti e guida sul player
src/autoplay-permission.js   pagine del sito: permesso di autoplay al player
src/cinema.js                pagine del sito: player a tutta finestra tra un episodio e l'altro
src/recovery.js              pagine del sito: ricarica dell'episodio quando lo streaming si blocca
src/site-health.js           pagine del sito: riconoscimento della struttura e risposte a "Verifica tutto"
src/popup/                   menu dell'icona (HTML, CSS, JS)
icons/                       icone 16, 32, 48 e 128 px (tools/make_icons.py, serve Pillow; docs/icona.png a 512 px)
scripts/check.mjs            controlli del repository (npm run check)
scripts/build.mjs            zip installabile, SHA-256, version.json, Keep_Watching_GitHub.zip
tests/unit/                  test di unità (node --test)
tests/e2e/                   test end-to-end su un sito di prova (Python, Playwright, Chromium)
.github/                     CI, release, modelli per le segnalazioni
```

L'estensione non usa librerie esterne. npm serve solo per ESLint (dipendenza di sviluppo).

## Componenti dell'estensione

| File | Dove gira | Compito |
|---|---|---|
| `src/player.js` | Player (`vixcloud.co/embed/*`) | Rileva la fine dell'episodio, gestisce conto alla rovescia, limite e notifiche, clicca "prossimo episodio", avvia il nuovo episodio |
| `src/panel.js` | Player (`vixcloud.co/embed/*`) | Riquadro e avvisi brevi sul player usati da `player.js`, tema e variabili d'aspetto, stile isolato in Shadow DOM |
| `src/toolbar.js` | Player (`vixcloud.co/embed/*`) | Barra di pulsanti sul player, usata da `player.js` |
| `src/guide.js` | Player (`vixcloud.co/embed/*`) | Guida alle scorciatoie sul player |
| `src/lib/stats.js` | Player, service worker e popup | Statistiche: giorni, sessioni, riepiloghi, CSV, JSON, importazione (oggetto globale `KWStats`) |
| `src/lib/updates.js` | Popup | Controllo degli aggiornamenti (`version.json` e `CHANGELOG.md` da `raw.githubusercontent.com`) e confronto delle versioni (oggetto globale `KWUpdates`) |
| `src/lib/links.js` | Popup | Collegamenti ufficiali e lettura di `links.json` (oggetto globale `KWLinks`) |
| `src/hosts.js` | Player e pagine del sito | Domini del player supportati (`KW_PLAYER_HOSTS`) |
| `src/recovery.js` | Pagine del sito (`*/iframe/*`) | Su richiesta ricarica l'iframe intermedio con `minute=N` |
| `src/site-health.js` | Pagine del sito (`*/iframe/*`, `*/watch/*`) | Riconosce la struttura della pagina (iframe dell'episodio, iframe del player su vixcloud.co), segnala le pagine senza player, risponde a "Verifica tutto" |
| `src/lib/health.js` | Player, service worker e popup | Macchina a stati del player, politica dei tentativi, classificazione degli errori del video, verifiche, cronologia eventi (oggetto globale `KWHealth`) |
| `src/autoplay-permission.js` | Pagine del sito (`*/iframe/*`, `*/watch/*`) | Aggiunge `allow="autoplay"` all'iframe del player e lo ricarica con il marcatore |
| `src/cinema.js` | Pagine del sito (`*/iframe/*`, `*/watch/*`) | In modalità cinema allarga a tutta la finestra l'iframe che porta al player; Esc per uscire |
| `src/background.js` | Service worker | Badge, scorciatoie, notifiche, schermo intero della finestra, unico scrittore di statistiche e cronologia, stato per scheda, Verifica tutto, migrazione delle impostazioni, novità dopo un aggiornamento |
| `rules.json` | Rete del browser | Blocca il caricamento del player senza marcatore `kw_autoplay=1` |
| `src/defaults.js` | Service worker, player e popup | Opzioni predefinite e validazione, profili, categorie di popup, comandi, link del progetto; documenta tutte le chiavi di `chrome.storage.local` |
| `src/popup/*` | Menu dell'icona (anche in scheda con `?tab=1`) | Sezioni, impostazioni, statistiche, aggiornamenti |

Nel player, `defaults.js`, `lib/stats.js`, `lib/health.js`, `panel.js`, `toolbar.js`, `guide.js` e `player.js` vengono caricati in quest'ordine (vedi `manifest.json`) e condividono le stesse variabili globali: `player.js` usa `kwSanitize`, `kwPopupVisible`, `kwActiveSleep`, `kwFormatTime`, `KWStats`, `kwCreatePanel`, `kwCreateToast`, `kwCreateToolbar` e `kwCreateGuide` definiti negli altri. Il service worker carica `defaults.js`, `lib/stats.js` e `lib/health.js` con `importScripts`.

### Flusso di un cambio episodio

1. Il video finisce: `player.js` riceve l'evento `ended` (oppure `timeupdate` se "salta i titoli di coda" è attivo).
2. Se il pulsante `.next-episode` non c'è, `player.js` chiede una notifica di fine episodi (o di pulsante non trovato, se l'URL ha `nextEpisode=1`).
3. Se il limite "chiedi se continuare" è raggiunto, mostra la domanda sul player e si ferma lì finché non si risponde.
4. Altrimenti mostra il conto alla rovescia; alla scadenza (o con "Vai ora") aggiorna il conteggio, salva `pendingPlayAt`, passa alla modalità cinema se il player è a schermo intero e clicca `.next-episode` (solo se non è disattivato; se il player dice che c'è un successivo ma il pulsante non c'è ancora, lo aspetta fino a 3 s). Da qui lo stato del player è "cambio episodio" e un nuovo cambio non può partire.
   - Se dopo 15 s il documento del player esiste ancora, il clic non ha avuto effetto: si clicca una seconda volta; dopo altri 15 s compare "Cambio episodio non riuscito" con **Riprova**, l'errore va in cronologia e, con la scheda nascosta, arriva una notifica.
5. Il sito aggiorna l'URL della pagina principale e ricarica l'iframe intermedio.
6. Nell'iframe intermedio, il browser inizia a caricare il player; `rules.json` blocca la richiesta.
7. `autoplay-permission.js` aggiunge `allow="autoplay; fullscreen"` all'iframe e reimposta l'URL con `&kw_autoplay=1`: la regola lo lascia passare.
8. Il player si carica con il permesso. Di solito JW Player parte da solo; se resta in pausa, `player.js` legge `pendingPlayAt` (valido 30 secondi), aspetta il video tramite i suoi eventi e chiama `video.play()`.
9. Se il video non parte o viene rimesso in pausa entro 5 secondi mentre la scheda è nascosta, `player.js` riprova quando la scheda torna visibile (evento `visibilitychange`).

## Scelte tecniche e alternative scartate

- **Eventi del `<video>` invece dell'API di JW Player.** I content script girano in un ambiente isolato e non vedono l'oggetto `jwplayer` della pagina. Gli eventi del `<video>` invece sono condivisi. Gli eventi media non fanno bubbling, quindi si ascoltano in fase di capture sul `document`: così funziona anche se JW Player crea il `<video>` dopo lo script.
- **`element.click()` sul pulsante.** Verificato: JW Player reagisce al click sintetico sul pulsante `.next-episode`.
- **`video.play()` diretto per l'avvio.** Nelle prime versioni si cliccava il pulsante Play di JW e si aspettavano 3 secondi, interpretando il mancato avvio come un blocco dell'audio: era una deduzione sbagliata. Ora il fallback senza audio scatta solo con un `NotAllowedError` restituito dal browser.
- **Marcatore nella query e non nell'hash.** Le regole di rete non vedono il frammento `#…` dell'URL, quindi non potrebbero distinguere i due caricamenti.
- **Ricaricare il player senza bloccarlo prima: scartato.** La prima richiesta arriverebbe comunque al server, con il rischio di consumare il token.
- **Aggiungere il permesso dopo l'inserimento dell'iframe: non basta.** Vedi [SITE_NOTES.md](SITE_NOTES.md#il-problema-dellautoplay-e-la-soluzione).
- **Script agganciati al percorso e non al dominio del sito.** Il dominio principale cambia periodicamente, mentre il percorso (`/it/iframe/`, `/it/watch/`) e il dominio del player sono rimasti stabili.

## Scheda in background

Quando la finestra è ridotta a icona o la scheda non è quella attiva, la pagina diventa "nascosta" (`document.hidden === true`) e Chrome applica alcune limitazioni:

- **Timer rallentati.** `setTimeout` e `setInterval` scattano al massimo una volta al secondo, e dopo alcuni minuti di silenzio anche una volta al minuto. Per questo `player.js` non usa cicli di timer per aspettare il video, ma i suoi eventi (`loadstart`, `loadedmetadata`, `canplay`), che arrivano normalmente.
- **Eventi del video.** `ended` e `timeupdate` continuano ad arrivare finché il video suona, quindi il rilevamento della fine episodio funziona anche in background.
- **Avvio automatico di JW Player.** JW Player può essere configurato per avviarsi solo quando il player è visibile sullo schermo. Con la scheda nascosta, quindi, il nuovo episodio può restare fermo finché non interviene `player.js`.

Cosa fa l'estensione: avvia lei il video se è fermo. Con la scheda nascosta e **Parti anche con il browser ridotto a icona** attivo (`backgroundStart`, di serie), se `play()` viene rifiutato o il player rimette in pausa il video nei primi 90 secondi, `player.js` riprova con le attese di `KWHealth.BACKGROUND_PLAY_DELAYS` (1,5 / 3 / 6 / 10 / 20 / 30 s: sei tentativi). Ogni tentativo è un semplice `video.play()` con l'audio: niente trucchi sulla visibilità della pagina. Se la scheda torna visibile i tentativi si fermano e l'avvio passa al percorso normale. Esauriti i tentativi: evento in cronologia con l'ultimo motivo, notifica "nuovo episodio pronto" (con le notifiche attive) e avvio al ritorno sulla scheda. Con l'opzione spenta resta il comportamento precedente (avvio al ritorno). Il browser può mettere in pausa da solo un video **senza audio** in una scheda nascosta: per questo il ripiego "senza audio" non aiuta in background.

Non verificabile sul sito di prova: Chromium avviato da Playwright considera sempre visibili le sue schede, anche con la finestra ridotta a icona. Va provato a mano ([TEST_PLAN.md](TEST_PLAN.md#prova-a-mano-sul-sito-reale), voce 21).

**Come diagnosticare.** Ogni messaggio chiave del log riporta `[scheda visibile]` o `[scheda nascosta]`. Per un test: apri DevTools con Ctrl+F8 e il filtro `Keep_Watching`, porta l'episodio agli ultimi secondi, riduci a icona, aspetta il cambio, poi torna sulla finestra e leggi il log. I messaggi restano perché la pagina principale non si ricarica. Il punto in cui la sequenza si interrompe indica il passaggio da indagare:

| Ultimo messaggio | Significato |
|---|---|
| Nessun `passo al successivo` | La fine episodio non è stata rilevata in background |
| `passo al successivo [scheda nascosta]`, poi nessun `Player caricato con permesso` | Il sito non ha caricato il nuovo episodio finché la scheda era nascosta |
| `Il video è stato rimesso in pausa subito dopo l'avvio [scheda nascosta]` | Il player mette in pausa i video non visibili |
| `Nuovo episodio avviato [scheda nascosta]` senza altri messaggi | Tutto ha funzionato in background |
| `Nuovo episodio partito con la scheda nascosta (tentativo N)` | Il player si era fermato, ripartito al tentativo N |
| `Il nuovo episodio non parte con la scheda nascosta (…)` | Sei tentativi falliti: il motivo tra parentesi; partirà al ritorno |

## Schermo intero tra episodi, notifiche e badge

### Schermo intero tra episodi ("modalità cinema")

Il browser concede lo schermo intero di un elemento (`requestFullscreen`) solo in risposta a un click dell'utente. Al cambio episodio l'iframe del player viene distrutto, lo schermo intero si perde e il nuovo player non può richiederlo.

Soluzione, in tre pezzi:
1. **`player.js`**, al momento del cambio, se il player è a schermo intero e l'opzione è attiva: esce dallo schermo intero, aspetta l'evento `fullscreenchange` e chiede al service worker `enterCinema`.
2. **`background.js`** salva lo stato della finestra (`cinemaPrevState`), imposta `cinema: true` e mette la finestra a schermo intero con `chrome.windows.update(…, { state: 'fullscreen' })`, che non richiede un click.
3. **`cinema.js`**, nella pagina principale e nell'iframe intermedio, vede `cinema: true` e rende `position: fixed` a tutta finestra l'iframe che porta al player.

Uscita dalla modalità (tutte portano a `exitCinema`, che ripristina lo stato della finestra):
- Esc, in qualunque dei tre documenti;
- il pulsante schermo intero del player (i suoi eventi vengono bloccati prima che arrivino a JW Player);
- F11 o altri cambi di stato della finestra (`windows.onBoundsChanged`, ignorato per 2,5 secondi dopo l'attivazione);
- fine degli episodi, "Basta così" al limite, uscita dalla pagina dell'episodio, sospensione dell'estensione o disattivazione dell'opzione.

### Notifiche

Le chiede `player.js` con un messaggio `notify` al service worker, che usa `chrome.notifications` e ricorda la scheda di provenienza in `chrome.storage.session`: cliccando la notifica si torna a quella scheda. Titolo ed episodio vengono dai parametri `t` e `d` dell'URL del player, codificati in base64.

Il controllo "pulsante non trovato" si basa su `nextEpisode=1` nell'URL del player. Durante lo sviluppo il parametro era presente quando esisteva un episodio successivo; il suo comportamento sull'ultimo episodio non è stato verificato sul sito reale.

### Badge e scorciatoia

Il badge viene aggiornato dal service worker a ogni cambio di `enabled`, `stopAfter`, `streak` o `lastAutoAt`. La scorciatoia è il comando `toggle-enabled` in `manifest.json`; il browser la assegna solo se non è già usata da un'altra estensione.

### Test senza il sito reale

Durante lo sviluppo della 1.2.0 le funzioni sono state provate su un sito finto con la stessa struttura a tre livelli (pagina, iframe intermedio, player su `vixcloud.co` reindirizzato in locale): conto alla rovescia, annulla, limite con domanda, badge, notifica di fine episodi, modalità cinema con entrata da schermo intero e uscita con Esc o con il pulsante del player.

## Intro, titoli per serie, timer di spegnimento

### Dati per serie

La chiave è il titolo della serie, letto dal parametro `t` dell'URL del player (`series` in `chrome.storage.local`, vedi `defaults.js`). `introEnd` è il secondo di fine intro; `creditsStart` sono i secondi prima della fine in cui iniziano i titoli, così vale anche per episodi di durata diversa. Due serie con lo stesso titolo condividerebbero i dati.

- **Salto intro** (`maybeSkipIntro`): valutato una sola volta per episodio, al primo `timeupdate` con il video in riproduzione. Non scatta se l'URL ha `minute>0` o se si sta riprendendo dopo una ricarica.
- **Titoli** (`creditsOffset`): il valore della serie ha la precedenza su quello generale; viene ignorato se lascerebbe meno di 60 secondi di episodio.

### Barra di pulsanti

`toolbar.js` crea un elemento in alto (a destra, a sinistra o al centro, da `uiPosition`) dentro `.jwplayer`, con stile in Shadow DOM chiuso. Compare a ogni movimento del mouse sul documento del player e si nasconde dopo `uiAutoHide` secondi (0 = sempre visibile), con una logica propria: non dipende dalle classi interne con cui JW nasconde i suoi controlli. Resta visibile con il mouse sopra o con il focus su un pulsante. I pulsanti vengono ricalcolati a ogni `timeupdate` e la barra si ridisegna solo se cambiano; i click arrivano a un solo listener delegato, quindi ridisegnare non accumula listener. Se JW ricrea `.jwplayer`, l'elemento viene riattaccato al nuovo contenitore.

**Perché "+60 s" spariva (fino alla 1.3.0).** La condizione era `else if (t < PLUS60_WINDOW_S)`: il pulsante esisteva solo nei primi 3 minuti e solo se non c'era "Salta intro". Dopo tre salti si superavano i 3 minuti e il pulsante non veniva più ridisegnato. Dalla 1.4.0 il salto avanti è sempre presente (tranne a meno di 1,5 secondi dalla fine), si ferma un secondo prima della fine e funziona anche con durata sconosciuta. Dopo un salto, l'evento `seeked` riallinea il controllo dello streaming bloccato, che altrimenti poteva scambiare salti ripetuti per un blocco.

### Timer di spegnimento

Lo stato è in `sleep` (`chrome.storage.local`), così sopravvive al cambio episodio. Il controllo avviene a ogni `timeupdate` del video, che non viene rallentato nelle schede nascoste come i timer.

- **A tempo**: alla scadenza il video va in pausa. Un timer scaduto da più di un minuto (per esempio mentre il video era in pausa) viene ignorato.
- **Fine episodio**: alla fine dell'episodio, o all'inizio dei titoli se impostati, il video si ferma invece di cambiare episodio.
- **Fine stagione**: il primo player che lo legge memorizza la stagione corrente; al caricamento di un episodio di un'altra stagione il video viene fermato (anche se JW lo avvia da solo, evento `playing`).
- **Dissolvenza**: negli ultimi 30 secondi `video.volume` scende in proporzione; a video fermo torna al valore iniziale, perché JW Player ricorda il volume per gli episodi successivi.

Tutti i timer si azzerano (`mode: 'off'`) dopo essere scattati. "Fine episodio" e "fine stagione" scadono dopo 12 ore.

### Pausa quando cambi scheda

Evento `visibilitychange` nel player: con la scheda nascosta il video va in pausa, al ritorno riparte solo se l'aveva fermato l'estensione. Se un nuovo episodio si carica mentre la scheda è nascosta, parte al ritorno. Questa funzione non è stata provata in automatico: l'ambiente di test non riesce a nascondere le schede.

## Streaming bloccato

Controllo ogni 2 secondi in `player.js`, solo dopo che il video ha suonato almeno una volta e mentre non è in pausa:

1. Il video è considerato in movimento se `currentTime` avanza in avanti di non più del tempo trascorso (più un margine). Salti indietro o in avanti non contano come avanzamento, e il confronto con il tempo reale regge i timer rallentati della scheda nascosta.
2. Dopo 12 secondi fermo: salto di 1 secondo in avanti, che spesso basta a far ripartire hls.js.
3. Dopo altri 12 secondi (o con un evento `error` del video): `player.js` salva `resume` (titolo, episodio, ultima posizione in cui il video suonava) e chiede al service worker `reloadEpisode`. Il service worker inoltra il messaggio a tutti i frame della scheda; risponde solo `recovery.js` nell'iframe intermedio, che si ricarica con `minute=<minuti>`.
4. Il nuovo player trova `resume` (valido 90 secondi, stesso titolo ed episodio) e porta il video al secondo esatto; `pendingPlayAt` lo fa partire.
5. Se serve una seconda ricarica entro 3 minuti (`lastReloadAt`), non viene fatta: arriva una notifica.

Perché non si ricarica l'iframe del player: il suo token scade pochi secondi dopo la generazione della pagina (`410 Gone`). L'iframe intermedio invece genera ogni volta un token nuovo.

Test fatti sul sito di prova: flusso video che si interrompe a metà, salto di 1 secondo, ricarica con `minute=0` e ripresa al secondo 13.

## Impostazioni, validazione e migrazione

Tutte le chiavi di `chrome.storage.local` sono documentate in cima a `src/defaults.js`. Le impostazioni passano sempre da `kwSanitize()` (player, service worker, popup): un valore di tipo sbagliato o fuori dall'elenco (`KW_CHOICES`) torna a quello predefinito, `popups` viene completato con le categorie mancanti, `uiOpacity` è limitata a 40–100, `skipCredits` a 0–3599.

All'installazione e a ogni aggiornamento (`chrome.runtime.onInstalled`) il service worker esegue `migrateSettings()`: legge tutto, scrive i valori validati e `settingsSchema` (2 dalla 1.4.0, 3 dalla 1.4.1). Chi arriva dalla 1.3.0 conserva tutte le sue scelte; le chiavi nuove prendono il valore di serie. Con `reason === 'update'` salva anche `whatsNew` (versione nuova e precedente), che il menu mostra una volta in Panoramica.

Le statistiche sono separate dalle impostazioni (`stats`), così azzerare l'una non tocca l'altra. Se `stats` non è leggibile viene ricostruito vuoto e la copia rovinata finisce in `statsCorrupt`.

## Popup sul video, profili e aspetto

**Categorie** (`KW_POPUP_CATEGORIES`): `countdown`, `confirm`, `limit`, `sleep`, `recovery`, `info`. In `player.js` ogni messaggio passa da `showPanel(categoria, …)` o `showToast(categoria, …)`, che consultano `kwPopupVisible(settings, categoria)`: con `popupsHidden` o la categoria spenta il messaggio non viene mostrato, ma l'azione avviene lo stesso:

- `countdown` nascosto: il cambio parte dopo lo stesso tempo con un `setTimeout` (`silentNext`); l'utente può sempre cambiare a mano.
- `limit` nascosto: non potendo chiedere, al limite la visione si ferma (scelta sicura) e, con la scheda nascosta, arriva la notifica. Per continuare basta premere "prossimo episodio" sul player: un click manuale azzera il conteggio di fila.
- `sleep`, `recovery`, `confirm`, `info` nascosti: timer, recupero e salvataggi avvengono senza riquadro.

Le notifiche sul desktop seguono solo `notifyEnd` e non dipendono dai popup. La guida alle scorciatoie è sempre visibile perché la chiede l'utente.

**Profili** (`KW_PROFILES`): ogni profilo ha un `preset` con solo le chiavi che cambia. `kwProfileChanges(id, attuali)` restituisce le modifiche da scrivere (più `profile`), applicate una volta sola al click: niente sovrascrive in seguito le scelte dell'utente. `kwProfileDiff(id, impostazioni)` elenca le chiavi diverse dal preset (anche `popups.<categoria>`): se non è vuoto il menu mostra "Personalizzato". I profili non toccano `sleep`, `stopAfter`, aspetto, scorciatoie e statistiche.

**Aspetto**: `uiSize`, `uiDensity`, `uiOpacity`, `uiPosition`, `uiAutoHide`, `toolbar`, `uiReduceMotion` (elenco in `KW_UI_KEYS`, usato da "Ripristina aspetto"). `kwApplyUiVars()` in `panel.js` li traduce in variabili CSS sugli host Shadow DOM (`--kw-scale`, `--kw-gap`, `--kw-alpha`): l'opacità vale solo per lo sfondo, il testo resta pieno. `prefers-reduced-motion: reduce` disattiva le animazioni anche senza l'opzione.

**Pulsanti della barra** (dalla 1.4.1): `toolbar` è un oggetto `{ skipIntro, quick, setIntro, setCredits, stopAtEnd, help }` (elenco ed etichette in `KW_TOOLBAR_BUTTONS`; gli id sono quelli dei pulsanti in `toolbarButtons()` di `player.js`). `toolbarButtons()` calcola i pulsanti utili in quel momento e alla fine toglie quelli spenti; se non ne resta nessuno `toolbar.js` nasconde la barra. I comandi da tastiera non guardano `toolbar`. Fino alla 1.4.0 c'era `uiMinimal`: `kwSanitize` la converte (se `toolbar` non esiste ancora) in `KW_TOOLBAR_MINIMAL`, e `migrateSettings()` cancella la vecchia chiave.

## Scorciatoie e guida

Comandi in `manifest.json` → `commands`: `toggle-enabled` (Alt+Shift+K), `quick-skip` (Alt+Shift+Right), `skip-intro` (Alt+Shift+S), `show-shortcuts` (Alt+Shift+H), `mark-intro`, `mark-credits`, `stop-at-end` (senza combinazione: Chrome ne accetta al massimo 4 suggerite). Le combinazioni con Alt+frecce senza Shift non sono state usate perché nel browser sono Indietro e Avanti.

Flusso: `chrome.commands.onCommand` → `handleCommand()` nel service worker. `toggle-enabled` agisce subito; gli altri vengono mandati alla scheda attiva. Prima il service worker chiede a tutti i frame `kwIsEditing`: risponde `true` solo il frame che ha il focus su un campo di testo, e in quel caso il comando viene ignorato. Poi manda `kwCommand` ai frame: risponde `{ ok: true }` solo il player.

Stato delle scorciatoie: `chrome.commands.getAll()` dà la combinazione effettiva (stringa vuota se non assegnata o tolta). `kwShortcutStates()` la confronta con quella suggerita (`missing` se il browser non l'ha assegnata, probabilmente per un conflitto con un'altra estensione) e con `KW_BROWSER_SHORTCUTS` (combinazioni note del browser). Un'estensione non può sapere quali combinazioni usano le altre estensioni o il sito: oltre a questo non si possono rilevare conflitti. `kwShortcutLabel()` mostra le frecce come `→`.

La guida (`guide.js`) è un host Shadow DOM sul player con l'elenco, la disponibilità attuale dei comandi (calcolata da `availability()` in `player.js`) e i pulsanti Chiudi e Configura. Esc la chiude sia dal player sia dalle pagine del sito (`cinema.js` inoltra `kwEscape`). `guideAutoClose` (0, 10, 20 s) la chiude da sola.

## Statistiche

**Misura** (`player.js`, `statsSample`): a ogni `timeupdate` e agli eventi di pausa e fine si confrontano il tempo trascorso secondo `performance.now()` (monotono, non risente dei cambi d'orologio) e l'avanzamento di `currentTime`. L'intervallo conta solo se il video stava suonando sia all'inizio sia alla fine (non in pausa, non in `seeking`, `readyState >= 3`) e se l'avanzamento è plausibile (non oltre `dt × velocità + 1,5 s`: un salto in avanti non conta). Si aggiunge `min(dt, avanzamento / velocità + 0,25)`, cioè tempo reale, non tempo del video. Intervalli oltre 20 s segnano il dato come stimato. Il tempo accumulato parte verso il service worker ogni 15 s e a pausa, fine, cambio di visibilità e `pagehide`.

**Scrittura**: solo il service worker scrive `stats`, in coda (`withStats`), così player e popup non si sovrascrivono. `KWStats.addPlay` divide a mezzanotte un tratto a cavallo di due giorni e limita ogni invio a 120 s (oltre: stimato). Le **sessioni** si chiudono dopo 30 minuti senza riproduzione. **Episodio completato**: `ended` o inizio dei titoli dopo aver visto almeno metà di quello che restava dal punto di partenza (minimo 60 s); il service worker scarta lo stesso episodio (chiave FNV-1a di titolo ed episodio) entro 6 ore. **Intro e titoli** contano solo i salti automatici; "Annulla" sull'intro la toglie (`introUndo`).

**Conservazione**: 400 giorni, sessioni comprese (`KWStats.prune`). Nessun titolo esce dai file esportati: nel JSON ci sono solo date, numeri e orari d'inizio delle sessioni.

**Formati**: CSV con separatore `;`, BOM UTF-8 e secondi interi (colonne in `KWStats.CSV_COLUMNS`); JSON `{ schema: "keep-watching-stats", version: 1, generatedAt, extensionVersion, period, totals, days: [...], sessions: [...] }`. L'importazione (`KWStats.parseImport`) accetta solo questo JSON, controlla ogni campo e rifiuta il file intero se qualcosa non torna; "unisci" tiene per ogni giorno il massimo di ogni valore e scarta le sessioni con lo stesso inizio, quindi reimportare non raddoppia.

**Limiti**: con la scheda in background il browser può rallentare `timeupdate` e il campionamento: il tempo resta corretto finché l'avanzamento è plausibile, altrimenti il tratto non viene contato. Se il browser viene chiuso di colpo si perdono al massimo gli ultimi 15 secondi.

## Stato del player, Centro salute e cronologia

**Stato del player.** `player.js` crea una macchina a stati (`KWHealth.createMachine`) e la alimenta con gli eventi del `<video>` (`loadedmetadata`/`canplay`, `playing`, `pause`, `waiting`, `ended`, `error`), con l'avanzamento reale del tempo (`timeupdate` con il tempo che cresce di poco) e con le decisioni dell'estensione (blocco rilevato, recupero, cambio episodio, cambio fallito, serve un'azione, nessun video dopo 30 s). Stati, transizioni e condizioni di uscita sono in [Macchina a stati del player](#macchina-a-stati-del-player). Lo stato e alcuni dati (pulsante "prossimo episodio", ultimo errore, ultimo recupero, ultimo cambio, permesso di autoplay del documento) arrivano al service worker con `kwHealth` al massimo una volta al secondo e vengono salvati in `chrome.storage.session` sotto `health:<id scheda>`. Alla chiusura del player (`pagehide`) lo stato diventa "chiuso"; all'uscita dalla pagina principale la voce della scheda si cancella; alla chiusura della scheda pure.

**Verifica tutto.** Il menu manda `kwVerifyAll` con l'id della scheda (quella attiva, o l'ultima con un episodio se il menu è aperto in una scheda). Il service worker manda `kwHealthCheck` a tutti i frame della scheda; ogni frame (pagina principale, iframe dell'episodio, player) risponde con un proprio messaggio `kwHealthReport`, raccolto per 1,5 secondi. `chrome.tabs.sendMessage` restituisce una sola risposta e l'elenco dei frame richiederebbe il permesso `webNavigation`: così non serve. Se nessuno script risponde, la scheda non è una pagina del sito. Al risultato si aggiungono la prova della memoria (scrittura e lettura in `local` e `session`) e gli errori dell'ultima ora. Le verifiche del player leggono soltanto: non cambiano episodio, non saltano, non mettono in pausa. Il risultato va in `healthLast` e in cronologia.

**Cronologia.** Chiave `eventLog` (`{ schema: 1, events: [...] }`), scritta solo dal service worker in coda (`withLog`). Ogni evento: `at`, `cat` (extension, site, player, next, skip, recovery, health, settings), `level` (info, warn, error), `msg`, e se servono `fn`, `from`, `to`, `action`, `result`, più `count` e `lastAt` per i raggruppamenti. `KWHealth.cleanEvent` tiene solo questi campi, accorcia i testi e toglie dagli indirizzi tutto tranne host e percorso (e i parametri come `token=`). Lo stesso evento entro 10 minuti aumenta il conteggio; si tengono 300 righe.

**Messaggi privilegiati.** `kwStatsReset`, `kwStatsImport`, `kwVerifyAll`, `kwLogClear` e `kwShowGuide` sono accettati solo se `sender.url` è una pagina dell'estensione. Tutti i messaggi devono avere `sender.id` uguale all'id dell'estensione (le pagine web non possono comunque scrivere all'estensione: manca `externally_connectable`).

**Aggiungere un evento.** Nel player: `logEvent({ cat, level, fn, msg, action, result })`. Nelle pagine del sito: lo stesso in `site-health.js`. Un evento va registrato quando cambia qualcosa di significativo, non a ogni `timeupdate`.

## Macchina a stati del player

Definita in `src/lib/health.js` (`STATES`, `TRANSITIONS`, `nextState`), usata da `player.js`. Lo stato viene da ciò che si osserva sul `<video>`, mai dalle sole impostazioni.

| Stato | Quando ci si entra | Quando se ne esce |
|---|---|---|
| In caricamento (`loading`) | All'avvio del player | Video pronto, oppure 30 s senza video → non compatibile |
| Pronto (`ready`) | `loadedmetadata`/`canplay` del primo video | `playing` |
| In riproduzione (`playing`) | `playing`, o il tempo avanza davvero | Pausa, buffering, blocco, fine, cambio |
| In pausa (`paused`) | `pause` (non a fine video) | `playing` |
| Caricamento dati (`buffering`) | `waiting` | Il tempo avanza; dopo 12 s senza avanzamento → bloccato |
| Bloccato (`stalled`) | Sorveglianza: 12 s senza avanzamento mentre dovrebbe suonare | Il tempo avanza, o pausa dell'utente |
| Recupero in corso (`recovering`) | Salto di 1 s o ricarica | Il tempo avanza (riuscito), pausa, recupero fallito |
| Cambio episodio (`switching`) | Clic su "prossimo episodio" | Il documento sparisce (riuscito) o clic senza effetto (errore) |
| Episodio finito (`ended`) | `ended` | `playing` (si riguarda) |
| Errore recuperabile (`error`) | Errore del video con codice 2, 3, 4; recupero o cambio falliti | Il tempo avanza, o serve un'azione |
| Serve un'azione (`fatal`) | Ricarica già fatta da poco, pagina del sito che non risponde, avvio bloccato dal browser, cambio episodio fallito due volte | Il tempo avanza (l'utente ha risolto) |
| Non compatibile (`unsupported`) | Nessun video dopo 30 s | Compare un video che suona |

Durante il cambio episodio pause e buffering del vecchio video non cambiano lo stato. Da "bloccato" e "in recupero" non si esce per un altro buffering. Ogni cambio di stato viene riferito al service worker al massimo una volta al secondo (`chrome.storage.session`, per scheda); gli stati di problema sono anche registrati in cronologia.

**Cosa sceglie la modalità adattiva:** in caricamento aspetta (fino a 30 s); con un pulsante atteso ma assente lo aspetta (3 s) prima di concludere; in buffering aspetta (12 s); da bloccato prova il salto, poi la ricarica (una per episodio, una ogni 3 minuti); con errori non recuperabili o dopo i tentativi chiede all'utente. Non ripete mai all'infinito: i tentativi sono contati.

## Aggiornamenti

Il menu (`popup.js` con `lib/updates.js`) legge file semplici del repository `KW_LINKS.repo` (`MashaUP/Keep_Watching`, definito una volta sola in `defaults.js`), senza autenticazione (`credentials: 'omit'`, `cache: 'no-store'`, nessun token né parametro). Non usa l'API di GitHub (60 richieste l'ora senza accesso) né le release:

1. `GET https://raw.githubusercontent.com/MashaUP/Keep_Watching/main/version.json` (scritto da `npm run package`): versione, data, nome dello zip, SHA-256, novità (`notes`). 404 vuol dire repository privato, nome cambiato o file non pubblicato.
2. `GET …/main/CHANGELOG.md`, facoltativo: registro delle versioni e, se `notes` è vuoto, le novità della versione.
3. «Scarica aggiornamento» apre `https://github.com/MashaUP/Keep_Watching/raw/HEAD/Keep_Watching-x.y.z.zip`: lo zip deve essere nella radice del repository (lo garantisce `npm run check`).

Le versioni si confrontano secondo SemVer (`compareVersions`: prefisso `v` ignorato, prerelease più vecchia della versione finale, `1.10.0 > 1.9.0`). Il risultato si salva in `updateCheck` ed è mostrato anche senza rete. Limiti: un controllo manuale al minuto; quello automatico al massimo uno ogni 24 ore, solo all'apertura del menu e solo con `updateAutoCheck`; con `403/429` e `Retry-After` nessuna richiesta fino alla scadenza indicata (al massimo un'ora).

**Installazione**: un'estensione caricata da cartella non può sostituire i propri file e il codice remoto non viene mai eseguito. "Scarica aggiornamento" apre l'URL dello zip in una scheda (il browser lo scarica); l'utente lo estrae sopra la cartella; "Ho estratto lo zip: ricarica l'estensione" salva `reloadRequest` con la versione attuale e chiama `chrome.runtime.reload()`. Al ritorno la Panoramica confronta la versione del manifest con quella salvata: solo se è cambiata dice "Aggiornamento installato". Lo SHA-256 di `version.json` non viene ancora verificato dall'estensione (servirebbe il permesso `downloads`: vedi [TODO.md](../TODO.md)).

Messaggi d'errore gestiti: rete assente, `version.json` non trovato (repository privato o file mancante), limite di GitHub, `version.json` non valido, versione installata più nuova di quella pubblicata. Fino alla 1.6.0 si leggevano prima le release dall'API: le installazioni 1.6.0 continuano a trovare le release pubblicate con lo zip allegato da `release.yml`.

## Collegamenti ufficiali

Fonte unica: `src/lib/links.js` (`KWLinks`), usata solo dal menu. Il menu genera da lì le icone in basso a sinistra (`#navLinks`, solo `KWLinks.NAV_IDS`: GitHub, Discord, Ko-fi, Guida), l'elenco **Community e aiuto** (`#linkList`, tutti i collegamenti accesi tranne Ko-fi), il pulsante e la riga Ko-fi (`[data-kofi-link]`) e il collegamento al repository negli Aggiornamenti (`#repoLink`). `KW_LINKS` in `defaults.js` resta solo per i riferimenti tecnici (repository di "Cerca aggiornamento", pagina delle scorciatoie).

Configurazione remota: `links.json` nella radice del repository (formato in [RELEASE.md](RELEASE.md#cambiare-un-collegamento)), letto con `GET https://raw.githubusercontent.com/MashaUP/Keep_Watching/main/links.json` (senza credenziali, tempo massimo 5 s). Cache in `chrome.storage.local` → `linksRemote` (`{ at, checkedAt, data, lastError?, okAt? }`), rinnovata al massimo ogni 12 ore all'apertura del menu e, con **Cerca aggiornamento**, al massimo una volta al minuto. Regole di `KWLinks.nextCache`: dati validi → salvati; 404 → cache vuota (valori di serie); errore → si tiene l'ultima valida. Validazione in `KWLinks.parseRemote` e `KWLinks.validUrl`: serve `schemaVersion: 1`; chiavi di sole lettere minuscole; ogni voce validata da sola (una voce non valida resta al valore di serie); solo `https` sugli host consentiti, con `github`, `discord` e `kofi` limitati al proprio host; niente credenziali o porte; testi ripuliti; icone solo tra quelle del menu; campi sconosciuti ignorati; `order` facoltativo. I testi arrivano nella pagina solo con `textContent`. Una cache scritta dalla 1.6.0 (formato con `schema` e chiavi `bug-report`) viene usata solo per le chiavi ancora valide e sostituita al primo controllo riuscito.

Test: `tests/unit/links.test.js` (compreso il controllo che `links.json` sia valido e uguale ai valori di serie, ripetuto da `npm run check`) e `tests/e2e/test_links.py`.

## Controlli di robustezza (audit 1.5.0)

- **Listener:** tutti registrati una sola volta per documento; il player è un documento nuovo a ogni episodio, quindi non si accumulano. La barra usa un solo listener delegato.
- **Timer:** nel player due intervalli (sorveglianza ogni 2 s, statistiche ogni 15 s) che finiscono con il documento; i timeout (verifica del cambio, verifica della ricarica, attesa del video) sono singoli e cancellati quando serve. In `cinema.js` l'intervallo gira solo a modalità attiva.
- **Observer:** uno solo, in `autoplay-permission.js`, su `src` e nodi aggiunti; serve finché la pagina vive.
- **Permessi:** invariati (`storage`, `notifications`, `declarativeNetRequest`). Verifica tutto non usa `webNavigation` né `tabs`: ogni frame risponde con un messaggio proprio.
- **Codice eseguito:** nessun `eval`, nessun codice remoto. `innerHTML` solo con modelli fissi; i testi dinamici passano da `textContent`.
- **Duplicazione nota:** il controllo "si sta scrivendo in un campo" è sia in `player.js` sia in `cinema.js`, perché girano in pagine diverse.

