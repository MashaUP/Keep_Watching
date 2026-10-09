# Manutenzione di Keep_Watching

Guida tecnica per capire come funziona l'estensione, cosa può rompersi quando il sito cambia e come diagnosticare i problemi. Le informazioni sul sito sono state verificate sul sito reale durante lo sviluppo (settembre 2026, JW Player 8.36.4); le funzioni aggiunte nella 1.2 sono state provate anche su un sito di prova con la stessa struttura (vedi [sezione 11](#11-schermo-intero-tra-episodi-notifiche-e-badge)).

## Indice

1. [Struttura del sito](#1-struttura-del-sito)
2. [Componenti dell'estensione](#2-componenti-dellestensione)
3. [Il problema dell'autoplay e la soluzione](#3-il-problema-dellautoplay-e-la-soluzione)
4. [Dipendenze dal sito (punti fragili)](#4-dipendenze-dal-sito-punti-fragili)
5. [Fare debug sul sito](#5-fare-debug-sul-sito)
6. [Comandi diagnostici](#6-comandi-diagnostici)
7. [Risoluzione dei problemi](#7-risoluzione-dei-problemi)
8. [Rilasciare una nuova versione](#8-rilasciare-una-nuova-versione)
9. [Scelte tecniche e alternative scartate](#9-scelte-tecniche-e-alternative-scartate)
10. [Scheda in background](#10-scheda-in-background)
11. [Schermo intero tra episodi, notifiche e badge](#11-schermo-intero-tra-episodi-notifiche-e-badge)
12. [Intro, titoli per serie, timer di spegnimento](#12-intro-titoli-per-serie-timer-di-spegnimento)
13. [Streaming bloccato](#13-streaming-bloccato)

---

## 1. Struttura del sito

La pagina di un episodio è formata da tre documenti annidati:

```
top      https://<dominio>/it/watch/66161?e=370641
 │       Pagina principale. Il cambio episodio avviene senza ricaricarla (navigazione
 │       interna): cambia solo il parametro ?e= nell'URL.
 │
 └─ iframe  https://<dominio>/it/iframe/66161?episode_id=370641&next_episode=1
     │      Iframe intermedio, stesso dominio della pagina principale.
     │      Ha allow="autoplay; fullscreen". Si RICARICA a ogni episodio.
     │      L'iframe del player è scritto direttamente nel suo HTML.
     │
     └─ iframe  https://vixcloud.co/embed/789971?token=…&expires=…&nextEpisode=1
                Player JW Player 8 (con hls.js). Dominio diverso dal sito.
                SENZA attributo allow. Nuovo a ogni episodio.
```

Dati osservati:

- **Dominio principale**: cambia periodicamente (all'epoca `streamingunity.fun`). L'estensione non ne dipende.
- **Token del player**: il parametro `expires` scade pochi secondi dopo la generazione della pagina. Ricaricare l'URL del player dopo la scadenza produce `410 (Gone)`.
- **Parametro `nextEpisode=1`**: presente nell'URL del player quando esiste un episodio successivo.
- **Parametri `t` e `d`** dell'URL del player: titolo della serie ed episodio in base64 (es. `S1:E4 La verità`). Il titolo è la chiave dei dati per serie, `S<n>:` dà la stagione.
- **Parametro `minute=N`** dell'iframe intermedio: il sito lo passa al player, che parte dal minuto N (verificato: con `minute=5` il player parte da 300 s). Il sito genera ogni volta un token nuovo per il player.
- **Salto con `video.currentTime`**: funziona con JW Player, che aggiorna anche la sua barra (verificato).
- **Memoria di JW Player** (`localStorage` di vixcloud.co): salva da solo sottotitoli (`jwplayer.captionLabel`), muto (`jwplayer.mute`) e qualità.
- **Protezione anti-DevTools** nel player: vedi [sezione 5](#5-fare-debug-sul-sito).

## 2. Componenti dell'estensione

| File | Dove gira | Compito |
|---|---|---|
| `src/player.js` | Player (`vixcloud.co/embed/*`) | Rileva la fine dell'episodio, gestisce conto alla rovescia, limite e notifiche, clicca "prossimo episodio", avvia il nuovo episodio |
| `src/panel.js` | Player (`vixcloud.co/embed/*`) | Riquadro sul player usato da `player.js` (conto alla rovescia e domande), con stile isolato in Shadow DOM |
| `src/toolbar.js` | Player (`vixcloud.co/embed/*`) | Barra di pulsanti in alto a destra sul player, usata da `player.js` |
| `src/recovery.js` | Pagine del sito (`*/iframe/*`) | Su richiesta ricarica l'iframe intermedio con `minute=N` |
| `src/autoplay-permission.js` | Pagine del sito (`*/iframe/*`, `*/watch/*`) | Aggiunge `allow="autoplay"` all'iframe del player e lo ricarica con il marcatore |
| `src/cinema.js` | Pagine del sito (`*/iframe/*`, `*/watch/*`) | In modalità cinema allarga a tutta la finestra l'iframe che porta al player; Esc per uscire |
| `src/background.js` | Service worker | Badge, scorciatoia `toggle-enabled`, notifiche, schermo intero della finestra |
| `rules.json` | Rete del browser | Blocca il caricamento del player senza marcatore `kw_autoplay=1` |
| `src/defaults.js` | Service worker, player e popup | Opzioni predefinite; documenta tutte le chiavi di `chrome.storage.local` |
| `src/popup/*` | Menu dell'icona | Legge e salva le opzioni |

Nel player, `defaults.js`, `panel.js`, `toolbar.js` e `player.js` vengono caricati in quest'ordine (vedi `manifest.json`) e condividono le stesse variabili globali: `player.js` usa `KW_DEFAULTS`, `kwActiveSleep`, `kwFormatTime`, `kwCreatePanel` e `kwCreateToolbar` definiti negli altri.

### Flusso di un cambio episodio

1. Il video finisce: `player.js` riceve l'evento `ended` (oppure `timeupdate` se "salta i titoli di coda" è attivo).
2. Se il pulsante `.next-episode` non c'è, `player.js` chiede una notifica di fine episodi (o di pulsante non trovato, se l'URL ha `nextEpisode=1`).
3. Se il limite "chiedi se continuare" è raggiunto, mostra la domanda sul player e si ferma lì finché non si risponde.
4. Altrimenti mostra il conto alla rovescia; alla scadenza (o con "Vai ora") aggiorna il conteggio, salva `pendingPlayAt`, passa alla modalità cinema se il player è a schermo intero e clicca `.next-episode`.
5. Il sito aggiorna l'URL della pagina principale e ricarica l'iframe intermedio.
6. Nell'iframe intermedio, il browser inizia a caricare il player; `rules.json` blocca la richiesta.
7. `autoplay-permission.js` aggiunge `allow="autoplay; fullscreen"` all'iframe e reimposta l'URL con `&kw_autoplay=1`: la regola lo lascia passare.
8. Il player si carica con il permesso. Di solito JW Player parte da solo; se resta in pausa, `player.js` legge `pendingPlayAt` (valido 30 secondi), aspetta il video tramite i suoi eventi e chiama `video.play()`.
9. Se il video non parte o viene rimesso in pausa entro 5 secondi mentre la scheda è nascosta, `player.js` riprova quando la scheda torna visibile (evento `visibilitychange`).

## 3. Il problema dell'autoplay e la soluzione

Questa è la parte più delicata dell'estensione ed è stata la più difficile da diagnosticare.

**Regola di Chrome.** Un video può partire con l'audio senza un click solo se il suo documento, o un documento antenato raggiungibile, ha registrato un'interazione dell'utente. Il browser però risale oltre un iframe di un altro dominio solo se quell'iframe ha `allow="autoplay"`.

**Nel nostro caso:**
- l'interazione dell'utente (il primo play) resta registrata nella pagina principale, che non si ricarica mai;
- l'iframe intermedio si ricarica a ogni episodio e perde l'interazione, ma ha `allow="autoplay"`;
- l'iframe del player **non** ha `allow="autoplay"`: la risalita si ferma lì e l'audio viene bloccato (`NotAllowedError`).

**Perché non basta aggiungere l'attributo.** L'iframe del player è scritto nell'HTML dell'iframe intermedio. Il browser ne avvia il caricamento mentre legge la pagina, prima che qualsiasi script possa intervenire, e un `allow` aggiunto dopo vale solo dal caricamento successivo. Verificato: con l'attributo aggiunto da script, `document.featurePolicy.allowsFeature('autoplay')` nel player restituiva `false`.

**Soluzione.** `rules.json` blocca nel browser la richiesta del player priva del marcatore `kw_autoplay=1`: la richiesta non parte, quindi il token non viene consumato. `autoplay-permission.js` aggiunge il permesso e reimposta l'URL con il marcatore. Il secondo caricamento parte con il permesso. Verificato: `allowsFeature('autoplay')` diventa `true` e JW Player avvia da solo l'episodio con l'audio.

> **Rischio principale.** Se `autoplay-permission.js` non viene iniettato (per esempio perché il sito cambia il percorso `/iframe/`), la regola di blocco resta attiva e **il player non si carica più**. È il primo controllo da fare se il player mostra una pagina di errore.

## 4. Dipendenze dal sito (punti fragili)

| Dipendenza | Dove si trova nel codice | Sintomo se cambia |
|---|---|---|
| Dominio del player `vixcloud.co` | `manifest.json` (primo `matches`), `rules.json` (`requestDomains`), `autoplay-permission.js` (`PLAYER_HOST`) | L'estensione non fa più nulla |
| Percorso `/embed/` del player | `manifest.json`, `rules.json` (`urlFilter`) | L'estensione non fa più nulla |
| Percorso `/iframe/` o `/watch/` delle pagine del sito | `manifest.json` (secondo `matches`) | **Il player non si carica** (bloccato da `rules.json`) |
| Classe `.next-episode` nella barra `.jw-controlbar` | `player.js` (`NEXT_SELECTOR`) | Notifica "pulsante non trovato" a fine episodio |
| Parametri `t`, `d`, `nextEpisode` nell'URL del player | `player.js` (`episodeInfo`) | Notifiche senza titolo; il controllo "pulsante non trovato" non scatta |
| Contenitore `.jwplayer` (elemento a schermo intero) | `player.js` (`PLAYER_SELECTOR`) | Il conto alla rovescia e la barra non si vedono a schermo intero |
| Formato `S<n>:E<n>` nel parametro `d` | `player.js` (`EPISODE.season`) | Il timer "fine stagione" non scatta |
| Parametro `minute=` dell'iframe intermedio | `recovery.js` | La ricarica per streaming bloccato riparte dall'inizio |
| Pulsante `.jw-icon-fullscreen` | `player.js` (`FULLSCREEN_SELECTOR`) | In modalità cinema il pulsante non fa uscire (Esc funziona comunque) |
| JW Player usa un unico `<video>` con eventi standard | `player.js` | Fine episodio non rilevata |
| Il parametro in più `kw_autoplay=1` è accettato dal server | `autoplay-permission.js` (`MARK`) | Il player dà errore dopo il caricamento |

## 5. Fare debug sul sito

### Aprire DevTools

Il player blocca F12 e le scorciatoie da tastiera. Apri DevTools dal menu del browser (**Altri strumenti → Strumenti per sviluppatori**), preferibilmente **prima** di premere play.

### Aggirare la protezione anti-DevTools

Il player esegue in ciclo un'istruzione `debugger` e misura il tempo: se DevTools è aperto e si ferma lì, il player si autodistrugge ("Connessione negata da vixcloud.co").

Per evitarlo: scheda **Sources → Ctrl+F8** (icona "Deactivate breakpoints"). Le istruzioni `debugger` vengono ignorate. Poi ricarica la pagina.

### Scegliere il contesto giusto in Console

Il menu a tendina in alto a sinistra della Console (predefinito **top**) sceglie in quale documento eseguire i comandi:

- **top**: pagina principale. Da qui si può leggere anche l'iframe intermedio (stesso dominio) con `document.querySelector('iframe').contentDocument`.
- **66161** (o simile, dominio del sito): iframe intermedio.
- **vixcloud.co**: player. Non accessibile da top: va selezionato nel menu.

A ogni cambio episodio il player viene distrutto e ricreato, e il menu torna su **top**. Prima di ogni comando nel player va riselezionato il contesto **vixcloud.co** del nuovo episodio.

### Leggere i log

Tutti i messaggi dell'estensione iniziano con `[Keep_Watching]`: scrivilo nel campo filtro della Console. La Console mostra i messaggi di tutti i contesti, qualunque sia quello selezionato.

### ⚠️ La Console falsa i test sull'autoplay

DevTools esegue ogni comando della Console **come se fosse un click dell'utente** (per lo stesso motivo da Console funziona `requestFullscreen()`). Conseguenze:

- un `video.play()` lanciato da Console parte con l'audio anche quando l'estensione verrebbe bloccata;
- anche solo leggere `navigator.userActivation.hasBeenActive` da Console in un contesto rende quel contesto "attivato".

**Non usare mai la Console per verificare l'autoplay.** Per misurare, aggiungi dei `console.log` temporanei nel codice dell'estensione e leggili durante un cambio episodio senza toccare la Console. Durante lo sviluppo si è usato questo:

```js
// in player.js, subito prima di video.play()
log('Diagnostica:', JSON.stringify({
  attivazione: navigator.userActivation.hasBeenActive,
  autoplayConsentito: document.featurePolicy ? document.featurePolicy.allowsFeature('autoplay') : 'n/d',
  readyState: video.readyState
}));
```

## 6. Comandi diagnostici

Da eseguire con DevTools aperto e Ctrl+F8 attivo.

### Struttura dei frame e permessi (contesto **top**)

```js
(() => JSON.stringify([...document.querySelectorAll('iframe')].map(f => {
  let inner;
  try {
    inner = [...f.contentDocument.querySelectorAll('iframe')].map(g => ({
      src: g.src.slice(0, 80), allow: g.getAttribute('allow')
    }));
  } catch (e) { inner = 'cross-origin'; }
  return { src: f.src, allow: f.getAttribute('allow'), inner };
}), null, 2))()
```

Risultato atteso: un iframe `…/it/iframe/…` con `allow: "autoplay; fullscreen"`, che contiene un iframe `vixcloud.co/embed/…&kw_autoplay=1` con `allow: "autoplay; fullscreen"`.

### Pulsanti della barra del player (contesto **vixcloud.co**)

```js
(() => JSON.stringify([...document.querySelectorAll('.jw-controlbar [role=button], .jw-controlbar button')]
  .map(b => ({ cls: b.className, label: b.getAttribute('aria-label') })), null, 2))()
```

Serve a ritrovare il pulsante "prossimo episodio" se `NEXT_SELECTOR` smette di funzionare. Al momento è quello con classe `next-episode`. Attenzione: il sito gli assegna per errore l'etichetta "Indietro di 10 Secondi". **Non** è `jw-icon-next` ("Successivo"), che è il pulsante playlist nativo di JW Player.

Per verificare un nuovo selettore: `document.querySelector('<selettore>').click()` deve passare all'episodio successivo.

### HTML grezzo dell'iframe intermedio (contesto **top**)

```js
fetch(document.querySelector('iframe').src).then(r => r.text()).then(t => {
  const i = t.indexOf('<iframe');
  return i < 0 ? 'Nessun <iframe> nell\'HTML: il player è creato via JavaScript' : t.slice(i, i + 400);
})
```

Indica se l'iframe del player è ancora scritto nell'HTML. Se un giorno fosse creato via JavaScript, si potrebbe eliminare `rules.json` e aggiungere il permesso al momento della creazione.

### Stato del cambio episodio (contesto **top**)

```js
window.__kwTest = 1   // poi cambia episodio e riesegui:
[window.__kwTest, location.href]
```

`1` significa che la pagina principale non si è ricaricata (comportamento attuale); `undefined` significa che si è ricaricata.

## 7. Risoluzione dei problemi

| Sintomo | Causa probabile | Cosa fare |
|---|---|---|
| Il player mostra una pagina di errore / non si carica | `autoplay-permission.js` non viene iniettato: il percorso delle pagine del sito è cambiato | Controlla l'URL dell'iframe intermedio (comando "Struttura dei frame") e aggiorna il secondo `matches` in `manifest.json`. Nel frattempo disattiva l'estensione per guardare |
| Player in errore anche se nel log compare "Player caricato con permesso" | Il server non accetta più il parametro `kw_autoplay=1`, oppure il token è scaduto | Verifica nella scheda Network la risposta di `embed/…&kw_autoplay=1`. Un `410` ricaricando la pagina dopo molto tempo è normale; ricarica la pagina del sito |
| A fine episodio non succede nulla | Selettore del pulsante cambiato, oppure opzione disattivata | Controlla il log: "Nessun pulsante…" indica il selettore. Usa il comando "Pulsanti della barra" |
| Nessun log `[Keep_Watching]` nel player | Dominio o percorso del player cambiati | Controlla l'URL del player e aggiorna `manifest.json`, `rules.json` e `PLAYER_HOST` |
| Il nuovo episodio parte muto | L'autoplay con audio è stato rifiutato (`NotAllowedError` nel log) | Verifica che nel player `allow` sia presente e che il primo play della sessione sia stato fatto a mano. Aggiungi la diagnostica della sezione 5 |
| Parte muto anche avviando a mano | JW Player ricorda lo stato "muto" | Riattiva l'audio una volta dal controllo del volume del player |
| Il player si chiude aprendo DevTools | Protezione anti-DevTools | Ctrl+F8 in Sources, poi ricarica |
| La barra di pulsanti non compare | Mouse non mosso sul video, `.jwplayer` cambiato, o il sito blocca gli eventi del mouse | Muovi il mouse sul video; controlla `PLAYER_SELECTOR` |
| L'intro non viene saltata | Opzione "Salta l'intro" spenta, intro non segnata per quella serie, episodio partito da `minute=` | Controlla l'elenco delle serie nel menu |
| Volume rimasto basso dopo il timer | Pagina chiusa durante la dissolvenza: JW Player ha ricordato il volume | Rialza il volume una volta dal player |
| Notifica "streaming bloccato" | Due blocchi entro 3 minuti | Ricarica la pagina; se succede spesso, il problema è del server |
| Il conto alla rovescia non compare | Opzione su "No, cambia subito", oppure `.jwplayer` cambiato | Controlla il menu; poi cerca nel player il contenitore che va a schermo intero |
| Notifica "pulsante non trovato" | Il sito ha cambiato la barra dei controlli | Usa il comando "Pulsanti della barra" e aggiorna `NEXT_SELECTOR` |
| Nessuna notifica | Notifiche disattivate nel menu, nel browser o nel sistema operativo | Controlla le impostazioni di notifica di Windows per Brave |
| Bloccato a schermo intero dopo la fine della serie | Modalità cinema rimasta attiva | Premi Esc o F11 |
| Con la finestra ridotta a icona il cambio episodio non avviene o il nuovo episodio resta fermo | Limiti delle schede in background | Vedi [sezione 10](#10-scheda-in-background) |

## 8. Rilasciare una nuova versione

1. Aggiorna `"version"` in `manifest.json` secondo il [Semantic Versioning](https://semver.org/lang/it/):
   - **patch** (1.0.**1**): correzione, per esempio un selettore o un dominio aggiornati;
   - **minor** (1.**1**.0): nuova opzione o funzionalità;
   - **major** (**2**.0.0): cambiamento di comportamento incompatibile.
2. Aggiungi una sezione in `CHANGELOG.md`.
3. Esegui la checklist di test qui sotto.
4. Crea il pacchetto: `powershell -ExecutionPolicy Bypass -File tools/package.ps1` (Windows) oppure `sh tools/package.sh` (Linux, macOS, Git Bash). Nella radice viene creato `Keep_Watching-<versione>.zip`, che contiene la cartella `Keep_Watching/` con i soli file dell'estensione; lo zip della versione precedente viene eliminato e il nome dello zip nel README viene aggiornato.
5. Commit, tag e push (lo zip va incluso nel commit):
   ```
   git add -A
   git commit -m "v1.0.1: <descrizione>"
   git tag v1.0.1
   git push && git push --tags
   ```

### Checklist di test

Con DevTools aperto, Ctrl+F8 attivo e filtro `Keep_Watching` in Console:

- [ ] Il primo episodio si carica e nel log compare `Player caricato con permesso: autoplay; fullscreen`.
- [ ] A fine episodio compare `Episodio finito, passo al successivo.` e il sito passa all'episodio dopo.
- [ ] Il nuovo episodio parte **con l'audio** senza toccare nulla.
- [ ] Un click manuale su "prossimo episodio" fa partire il nuovo episodio da solo.
- [ ] "Salta i titoli di coda" cambia episodio al momento scelto.
- [ ] Sull'ultimo episodio disponibile compare `Nessun altro episodio disponibile` e non succede altro.
- [ ] Disattivando "Prossimo episodio automatico" l'episodio finisce senza cambi.
- [ ] Il conto alla rovescia compare a fine episodio; "Annulla" lo ferma, "Vai ora" cambia subito.
- [ ] A schermo intero, dopo il cambio episodio si resta a schermo intero; Esc e il pulsante schermo intero del player escono.
- [ ] "Chiedi se continuare dopo 1 episodio": al secondo finale compare la domanda; "Continua" va avanti, "Basta così" si ferma.
- [ ] Il badge mostra "1/1" durante il limite e "OFF" con Alt+Shift+K; la scorciatoia riattiva l'estensione.
- [ ] Sull'ultimo episodio arriva la notifica; cliccandola si torna alla scheda.
- [ ] "Fine intro qui" segna l'intro; nell'episodio successivo l'intro viene saltata e "Annulla" torna indietro.
- [ ] "Inizio titoli qui" vicino alla fine: il cambio episodio parte subito e negli episodi dopo al momento segnato.
- [ ] La barra compare muovendo il mouse sul video, anche a schermo intero, e sparisce dopo 3 secondi.
- [ ] Timer "Tra 15 minuti": il volume si abbassa negli ultimi 30 secondi, il video si ferma e il volume torna normale.
- [ ] "Stop a fine episodio" dalla barra: alla fine compare "Prossimo episodio" invece del cambio automatico.
- [ ] Timer "Alla fine della stagione": al primo episodio della stagione dopo il video si ferma.
- [ ] "Pausa quando cambi scheda": cambiando scheda il video va in pausa e riparte al ritorno.
- [ ] "Personalizzato…" con un valore come 3 min 30 s cambia episodio al momento giusto, e riaprendo il menu il valore è ancora lì.
- [ ] Con la finestra ridotta a icona durante il finale, il cambio episodio avviene e il nuovo episodio parte (o al più parte appena si torna sulla scheda).

Per portare rapidamente un episodio alla fine, trascina la barra di avanzamento agli ultimi secondi.

## 9. Scelte tecniche e alternative scartate

- **Eventi del `<video>` invece dell'API di JW Player.** I content script girano in un ambiente isolato e non vedono l'oggetto `jwplayer` della pagina. Gli eventi del `<video>` invece sono condivisi. Gli eventi media non fanno bubbling, quindi si ascoltano in fase di capture sul `document`: così funziona anche se JW Player crea il `<video>` dopo lo script.
- **`element.click()` sul pulsante.** Verificato: JW Player reagisce al click sintetico sul pulsante `.next-episode`.
- **`video.play()` diretto per l'avvio.** Nelle prime versioni si cliccava il pulsante Play di JW e si aspettavano 3 secondi, interpretando il mancato avvio come un blocco dell'audio: era una deduzione sbagliata. Ora il fallback senza audio scatta solo con un `NotAllowedError` restituito dal browser.
- **Marcatore nella query e non nell'hash.** Le regole di rete non vedono il frammento `#…` dell'URL, quindi non potrebbero distinguere i due caricamenti.
- **Ricaricare il player senza bloccarlo prima: scartato.** La prima richiesta arriverebbe comunque al server, con il rischio di consumare il token.
- **Aggiungere il permesso dopo l'inserimento dell'iframe: non basta.** Vedi [sezione 3](#3-il-problema-dellautoplay-e-la-soluzione).
- **Script agganciati al percorso e non al dominio del sito.** Il dominio principale cambia periodicamente, mentre il percorso (`/it/iframe/`, `/it/watch/`) e il dominio del player sono rimasti stabili.

## 10. Scheda in background

Quando la finestra è ridotta a icona o la scheda non è quella attiva, la pagina diventa "nascosta" (`document.hidden === true`) e Chrome applica alcune limitazioni:

- **Timer rallentati.** `setTimeout` e `setInterval` scattano al massimo una volta al secondo, e dopo alcuni minuti di silenzio anche una volta al minuto. Per questo `player.js` non usa cicli di timer per aspettare il video, ma i suoi eventi (`loadstart`, `loadedmetadata`, `canplay`), che arrivano normalmente.
- **Eventi del video.** `ended` e `timeupdate` continuano ad arrivare finché il video suona, quindi il rilevamento della fine episodio funziona anche in background.
- **Avvio automatico di JW Player.** JW Player può essere configurato per avviarsi solo quando il player è visibile sullo schermo. Con la scheda nascosta, quindi, il nuovo episodio può restare fermo finché non interviene `player.js`.

Cosa fa l'estensione: avvia lei il video se è fermo; se il browser o il player lo bloccano (o lo rimettono in pausa entro 5 secondi), riprova appena la scheda torna visibile.

**Come diagnosticare.** Ogni messaggio chiave del log riporta `[scheda visibile]` o `[scheda nascosta]`. Per un test: apri DevTools con Ctrl+F8 e il filtro `Keep_Watching`, porta l'episodio agli ultimi secondi, riduci a icona, aspetta il cambio, poi torna sulla finestra e leggi il log. I messaggi restano perché la pagina principale non si ricarica. Il punto in cui la sequenza si interrompe indica il passaggio da indagare:

| Ultimo messaggio | Significato |
|---|---|
| Nessun `passo al successivo` | La fine episodio non è stata rilevata in background |
| `passo al successivo [scheda nascosta]`, poi nessun `Player caricato con permesso` | Il sito non ha caricato il nuovo episodio finché la scheda era nascosta |
| `Il video è stato rimesso in pausa subito dopo l'avvio [scheda nascosta]` | Il player mette in pausa i video non visibili |
| `Nuovo episodio avviato [scheda nascosta]` senza altri messaggi | Tutto ha funzionato in background |

## 11. Schermo intero tra episodi, notifiche e badge

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

## 12. Intro, titoli per serie, timer di spegnimento

### Dati per serie

La chiave è il titolo della serie, letto dal parametro `t` dell'URL del player (`series` in `chrome.storage.local`, vedi `defaults.js`). `introEnd` è il secondo di fine intro; `creditsStart` sono i secondi prima della fine in cui iniziano i titoli, così vale anche per episodi di durata diversa. Due serie con lo stesso titolo condividerebbero i dati.

- **Salto intro** (`maybeSkipIntro`): valutato una sola volta per episodio, al primo `timeupdate` con il video in riproduzione. Non scatta se l'URL ha `minute>0` o se si sta riprendendo dopo una ricarica.
- **Titoli** (`creditsOffset`): il valore della serie ha la precedenza su quello generale; viene ignorato se lascerebbe meno di 60 secondi di episodio.

### Barra di pulsanti

`toolbar.js` crea un elemento in alto a destra dentro `.jwplayer`, con stile in Shadow DOM chiuso. Compare a ogni movimento del mouse sul documento del player e si nasconde dopo 3 secondi, con una logica propria: non dipende dalle classi interne con cui JW nasconde i suoi controlli. I pulsanti vengono ricalcolati a ogni `timeupdate` e la barra si ridisegna solo se cambiano.

### Timer di spegnimento

Lo stato è in `sleep` (`chrome.storage.local`), così sopravvive al cambio episodio. Il controllo avviene a ogni `timeupdate` del video, che non viene rallentato nelle schede nascoste come i timer.

- **A tempo**: alla scadenza il video va in pausa. Un timer scaduto da più di un minuto (per esempio mentre il video era in pausa) viene ignorato.
- **Fine episodio**: alla fine dell'episodio, o all'inizio dei titoli se impostati, il video si ferma invece di cambiare episodio.
- **Fine stagione**: il primo player che lo legge memorizza la stagione corrente; al caricamento di un episodio di un'altra stagione il video viene fermato (anche se JW lo avvia da solo, evento `playing`).
- **Dissolvenza**: negli ultimi 30 secondi `video.volume` scende in proporzione; a video fermo torna al valore iniziale, perché JW Player ricorda il volume per gli episodi successivi.

Tutti i timer si azzerano (`mode: 'off'`) dopo essere scattati. "Fine episodio" e "fine stagione" scadono dopo 12 ore.

### Pausa quando cambi scheda

Evento `visibilitychange` nel player: con la scheda nascosta il video va in pausa, al ritorno riparte solo se l'aveva fermato l'estensione. Se un nuovo episodio si carica mentre la scheda è nascosta, parte al ritorno. Questa funzione non è stata provata in automatico: l'ambiente di test non riesce a nascondere le schede.

## 13. Streaming bloccato

Controllo ogni 2 secondi in `player.js`, solo dopo che il video ha suonato almeno una volta e mentre non è in pausa:

1. Il video è considerato in movimento se `currentTime` avanza in avanti di non più del tempo trascorso (più un margine). Salti indietro o in avanti non contano come avanzamento, e il confronto con il tempo reale regge i timer rallentati della scheda nascosta.
2. Dopo 12 secondi fermo: salto di 1 secondo in avanti, che spesso basta a far ripartire hls.js.
3. Dopo altri 12 secondi (o con un evento `error` del video): `player.js` salva `resume` (titolo, episodio, ultima posizione in cui il video suonava) e chiede al service worker `reloadEpisode`. Il service worker inoltra il messaggio a tutti i frame della scheda; risponde solo `recovery.js` nell'iframe intermedio, che si ricarica con `minute=<minuti>`.
4. Il nuovo player trova `resume` (valido 90 secondi, stesso titolo ed episodio) e porta il video al secondo esatto; `pendingPlayAt` lo fa partire.
5. Se serve una seconda ricarica entro 3 minuti (`lastReloadAt`), non viene fatta: arriva una notifica.

Perché non si ricarica l'iframe del player: il suo token scade pochi secondi dopo la generazione della pagina (`410 Gone`). L'iframe intermedio invece genera ogni volta un token nuovo.

Test fatti sul sito di prova: flusso video che si interrompe a metà, salto di 1 secondo, ricarica con `minute=0` e ripresa al secondo 13.
