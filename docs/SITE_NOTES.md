# Keep Watching — note sul sito (C3)

Come sono fatti StreamingCommunity e il player, cosa può rompersi quando cambiano e come accorgersene. Le osservazioni hanno la data in cui sono state fatte: il sito può essere cambiato da allora. Quello che non è stato visto sul sito reale è segnato come tale.

## Diario delle osservazioni

| Data | Osservazione | Fonte |
|---|---|---|
| Settembre 2026 | Struttura a tre documenti (pagina, iframe intermedio, player), JW Player 8.36.4 con hls.js, pulsante `.next-episode`, parametri `t`, `d`, `nextEpisode`, `minute`, token del player che scade in pochi secondi (`410 Gone`), protezione anti-DevTools | Sito reale, durante lo sviluppo (1.0–1.1) |
| Settembre 2026 | Il player non ha `allow="autoplay"`; l'attributo aggiunto da script vale solo dal caricamento successivo | Sito reale (`document.featurePolicy.allowsFeature('autoplay')`) |
| Ottobre 2026 | Il player passa da `vixcloud.co` a `vixcloud.cc` (versione 1.5.1) | Sito reale, screenshot dell'utente |
| Ottobre 2026 | Con la 1.5.2 «Verifica tutto» riconosce il sito; l'utente conferma che «funziona tutto» | Sito reale, prova dell'utente |
| Non visto | Comportamento di `nextEpisode=1` sull'ultimo episodio; pagine di errore e manutenzione del sito; blocchi reali dello streaming | Solo sito di prova (`tests/e2e/server.py`) |

Livelli di verifica usati in questo documento:

| Livello | Significato |
|---|---|
| Verificato sul sito reale | Osservato su StreamingCommunity durante lo sviluppo (settembre 2026, JW Player 8.36.4). Il sito può essere cambiato da allora. |
| Verificato sul sito di prova | Provato dai test automatici su `tests/e2e/server.py`, un sito finto con la stessa struttura a tre livelli e le stesse classi di JW Player. Non sostituisce una prova sul sito reale. |
| Implementato, non verificato | Il codice esiste ma nessun test lo ha esercitato. |
| Non verificabile qui | L'ambiente di sviluppo non può riprodurlo (sito reale, GitHub reale, Brave reale, scheda nascosta). |

## Siti e player supportati

Un solo sito e un solo player. Nessun altro servizio è supportato e l'estensione non prova a riconoscerne altri.

| Elemento | Valore |
|---|---|
| Sito | StreamingCommunity (il dominio principale cambia spesso: non viene usato) |
| Riconoscimento della pagina | Percorso `…/watch/<id>` (pagina principale) e `…/iframe/<id>` (iframe intermedio), **più** la presenza dell'iframe del player su uno dei domini di `src/hosts.js` |
| Player | `vixcloud.co/embed/<id>` o `vixcloud.cc/embed/<id>` (e loro sottodomini; il sito è passato a vixcloud.cc nell'ottobre 2026), JW Player 8 con hls.js e `<video>` HTML5. Elenco in `src/hosts.js` |
| Dove sta il player | In un iframe di un'altra origine, dentro l'iframe intermedio del sito |
| Dati dall'URL del player | `t` titolo (base64), `d` episodio "S1:E2 Nome" (base64), `nextEpisode=1` se c'è un successivo, `minute=N` punto di partenza |
| Dati dal DOM del player | `.jwplayer` (contenitore), `.jw-controlbar .next-episode` (prossimo episodio), `.jw-icon-fullscreen` |
| Cosa viene ricreato | A ogni episodio: l'iframe intermedio e il player (documento nuovo). La pagina principale no (navigazione interna, cambia `?e=`) |
| Richiede un gesto dell'utente | Il primo avvio con audio (regola del browser); lo schermo intero vero |
| Dipende dal browser | Autoplay con audio (permesso `allow="autoplay"` sull'iframe), schermo intero, timer rallentati nelle schede nascoste |

**Domini.** Gli script delle pagine del sito girano su qualsiasi dominio con `/watch/` o `/iframe/` nel percorso, perché il sito cambia dominio. Non per questo un dominio qualunque è "riconosciuto": `autoplay-permission.js` modifica solo iframe il cui indirizzo è esattamente su uno dei domini di `src/hosts.js` (dalla 1.5.0 con un controllo sull'host, prima bastava la parola "vixcloud" in un punto qualsiasi dell'indirizzo), e `site-health.js` dichiara riconosciuta una pagina solo se contiene l'iframe dell'episodio. Una pagina con `/watch/` ma senza quella struttura compare in cronologia come "pagina /watch/ senza l'iframe dell'episodio" e non viene toccata. Le pagine di errore o di manutenzione del sito (iframe dell'episodio senza player) vengono segnalate dopo 15 secondi.

**Browser.** Brave e Chrome per computer (Chromium, Manifest V3). Edge e altri Chromium non sono stati provati. Firefox non è supportato: il manifest usa il service worker e `declarativeNetRequest` nella forma di Chrome, e non è stato verificato altrove.

## Struttura del sito

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
     └─ iframe  https://vixcloud.cc/embed/789971?token=…&expires=…&nextEpisode=1   (fino a ottobre 2026: vixcloud.co)
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
- **Protezione anti-DevTools** nel player: vedi [Fare debug sul sito](#fare-debug-sul-sito).

## Il problema dell'autoplay e la soluzione

Questa è la parte più delicata dell'estensione ed è stata la più difficile da diagnosticare.

**Regola di Chrome.** Un video può partire con l'audio senza un click solo se il suo documento, o un documento antenato raggiungibile, ha registrato un'interazione dell'utente. Il browser però risale oltre un iframe di un altro dominio solo se quell'iframe ha `allow="autoplay"`.

**Nel nostro caso:**
- l'interazione dell'utente (il primo play) resta registrata nella pagina principale, che non si ricarica mai;
- l'iframe intermedio si ricarica a ogni episodio e perde l'interazione, ma ha `allow="autoplay"`;
- l'iframe del player **non** ha `allow="autoplay"`: la risalita si ferma lì e l'audio viene bloccato (`NotAllowedError`).

**Perché non basta aggiungere l'attributo.** L'iframe del player è scritto nell'HTML dell'iframe intermedio. Il browser ne avvia il caricamento mentre legge la pagina, prima che qualsiasi script possa intervenire, e un `allow` aggiunto dopo vale solo dal caricamento successivo. Verificato: con l'attributo aggiunto da script, `document.featurePolicy.allowsFeature('autoplay')` nel player restituiva `false`.

**Soluzione.** `rules.json` blocca nel browser la richiesta del player priva del marcatore `kw_autoplay=1`: la richiesta non parte, quindi il token non viene consumato. `autoplay-permission.js` aggiunge il permesso e reimposta l'URL con il marcatore. Il secondo caricamento parte con il permesso. Verificato: `allowsFeature('autoplay')` diventa `true` e JW Player avvia da solo l'episodio con l'audio.

> **Rischio principale.** Se `autoplay-permission.js` non viene iniettato (per esempio perché il sito cambia il percorso `/iframe/`), la regola di blocco resta attiva e **il player non si carica più**. È il primo controllo da fare se il player mostra una pagina di errore.

## Dipendenze dal sito (punti fragili)

| Dipendenza | Dove si trova nel codice | Sintomo se cambia |
|---|---|---|
| Dominio del player (`vixcloud.co`, `vixcloud.cc`) | `src/hosts.js` (`KW_PLAYER_HOSTS`), `manifest.json` (primo `matches`), `rules.json` (`requestDomains`) | Il player non riceve gli script: niente cambio episodio, salti, barra. Centro salute e cronologia indicano il dominio trovato. Vedi «Se il player cambia dominio» qui sotto |
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

### Se il player cambia dominio

Successo nell'ottobre 2026: il player è passato da `vixcloud.co` a `vixcloud.cc` (versione 1.5.1). Sintomi: nell'elenco dei contesti della Console il frame del player (per esempio `784302 vixcloud.cc`) non ha Keep_Watching tra le estensioni; Centro salute e cronologia dicono "Player su un dominio non supportato: …" (se il nuovo dominio è ancora `vixcloud.*`) oppure "Pagina dell'episodio senza un player supportato" con gli host degli iframe trovati.

Per aggiungere un dominio, nelle tre posizioni (il browser vuole i domini scritti per esteso):

1. `src/hosts.js` → `KW_PLAYER_HOSTS`;
2. `manifest.json` → `content_scripts[0].matches` (`*://nuovo/embed/*` e `*://*.nuovo/embed/*`);
3. `rules.json` → `requestDomains` di entrambe le regole.

Poi `npm test` (controlla anche che i tre elenchi coincidano; `tests/unit/hosts.test.js`), una prova sul sito di prova con `/__config?playerhost=…` (aggiungendo il dominio alle `--host-resolver-rules` in `tests/e2e/kw.py`) e Verifica tutto sul sito reale.

## Fare debug sul sito

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

## Comandi diagnostici

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

## Risoluzione dei problemi (lato tecnico)

| Sintomo | Causa probabile | Cosa fare |
|---|---|---|
| Il player mostra una pagina di errore / non si carica | `autoplay-permission.js` non viene iniettato: il percorso delle pagine del sito è cambiato | Controlla l'URL dell'iframe intermedio (comando "Struttura dei frame") e aggiorna il secondo `matches` in `manifest.json`. Nel frattempo disattiva l'estensione per guardare |
| Player in errore anche se nel log compare "Player caricato con permesso" | Il server non accetta più il parametro `kw_autoplay=1`, oppure il token è scaduto | Verifica nella scheda Network la risposta di `embed/…&kw_autoplay=1`. Un `410` ricaricando la pagina dopo molto tempo è normale; ricarica la pagina del sito |
| A fine episodio non succede nulla | Selettore del pulsante cambiato, oppure opzione disattivata | Controlla il log: "Nessun pulsante…" indica il selettore. Usa il comando "Pulsanti della barra" |
| Nessun log `[Keep_Watching]` nel player | Dominio o percorso del player cambiati | Controlla l'URL del player e aggiorna `manifest.json`, `rules.json` e `PLAYER_HOST` |
| Il nuovo episodio parte muto | L'autoplay con audio è stato rifiutato (`NotAllowedError` nel log) | Verifica che nel player `allow` sia presente e che il primo play della sessione sia stato fatto a mano. Aggiungi la diagnostica di [Fare debug sul sito](#fare-debug-sul-sito) |
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
| Con la finestra ridotta a icona il cambio episodio non avviene o il nuovo episodio resta fermo | Limiti delle schede in background | Vedi [ARCHITECTURE.md, Scheda in background](ARCHITECTURE.md#scheda-in-background) |

## Matrice dei guasti (StreamingCommunity + vixcloud/JW Player 8)

| # | Scenario | Rilevamento | Recuperabile | Strategia | Limiti |
|---|---|---|---|---|---|
| A1 | Player non ancora caricato o lento | Nessun `<video>` con sorgente; stato "in caricamento" | Sì, aspettando | Attesa fino a 30 s (eventi del video, nessun polling) | — |
| A2 | Player inserito dopo il rendering | Eventi media in fase di cattura sul documento | Sì | Gli eventi arrivano anche per video creati dopo | — |
| A3 | Selettore del pulsante non più valido | `nextEpisode=1` nell'URL ma nessun `.next-episode` | No, serve aggiornare l'estensione | Evento in cronologia dopo 20 s; a fine episodio notifica e stato "serve un'azione" | Il pulsante va aggiornato in `NEXT_SELECTOR` |
| A4 | Player sostituito al cambio episodio | Il documento del player viene scaricato | Sì, è il comportamento normale | Lo stato passa per `pendingPlayAt` in storage | — |
| A5 | Iframe dell'episodio senza player | `site-health.js`: nessun iframe vixcloud dopo 15 s | No dall'estensione | Evento "pagina senza player"; Verifica tutto lo segnala | Pagina di errore del sito o struttura cambiata |
| A6 | Player presente ma senza video | Contenitore JW senza `<video>` dopo 30 s | No | Stato "non compatibile", evento con la causa probabile | — |
| A8 | Player spostato su un altro dominio (successo: vixcloud.co → vixcloud.cc) | `site-health.js`: iframe con host `vixcloud.*` non in elenco | No dall'estensione | Evento e Verifica tutto con il nome del dominio trovato | Il browser vuole i domini scritti nel manifest: serve una nuova versione |
| A7 | Player in un iframe di altra origine | — | — | Lo script del player gira direttamente nell'iframe di vixcloud (`all_frames`) | L'estensione non legge il DOM di altre origini da fuori |
| B1 | In riproduzione ma il tempo non avanza | Sorveglianza ogni 2 s: avanzamento confrontato con il tempo trascorso | Spesso | Salto di 1 s, poi ricarica dal secondo giusto | Una ricarica per episodio e una ogni 3 min |
| B2 | Buffering prolungato | `waiting`, `readyState < 3` | Spesso | Come B1, dopo 12 s; l'evento distingue "in attesa di dati" da "fermo con dati" | Non si distingue una rete lenta da un server fermo |
| B3 | Immagine ferma con audio che continua | Non osservabile (il tempo avanza) | — | Nessuna | Non rilevabile con le API disponibili |
| B4 | Pausa inattesa | `pause` | — | Nessun recupero: una pausa può essere voluta. Unica eccezione: subito dopo l'avvio con la scheda nascosta si riprova al ritorno | — |
| B5 | Scheda nascosta o rallentata | `document.hidden`; timer rallentati | — | I tempi si misurano con gli eventi del video e il tempo trascorso reale | Con la scheda nascosta il browser può ritardare tutto |
| C1 | Errore di rete o sorgente (codici 2, 4) | Evento `error` del video con `MediaError.code` | A volte | Ricarica dell'episodio (nuovo token), se il video era partito | Prima dell'avvio: solo avviso |
| C2 | Errore di decodifica (codice 3) | Come sopra | A volte | Come sopra | — |
| C3 | Caricamento interrotto (codice 1) | Come sopra | — | Solo registrato: di solito è un cambio pagina | — |
| C4 | Server del sito non disponibile, timeout | La pagina dell'episodio non arriva o non contiene il player | No | A5 | Le risposte HTTP del sito non sono visibili all'estensione |
| C5 | Errori interni di hls.js o di JW | Non visibili (variabili della pagina) | — | Si osservano solo le conseguenze sul `<video>` | Gli script dell'estensione non vedono `jwplayer()` |
| D1 | Pulsante non ancora comparso | Assente con `nextEpisode=1` | Sì | Attesa fino a 3 s | — |
| D2 | Pulsante disattivato o nascosto | `disabled`, `aria-disabled`, nessun riquadro | No | Non si clicca; stato "serve un'azione" | — |
| D3 | Il clic non cambia episodio | Il documento del player esiste ancora dopo 15 s | A volte | Un secondo clic, poi avviso con **Riprova** e notifica | Al massimo due clic automatici |
| D4 | L'URL cambia ma il nuovo player non arriva | Il nuovo player non parte; la pagina dell'episodio senza player | Parziale | A5; il nuovo episodio non viene avviato finché il video non c'è | — |
| D5 | Ultimo episodio | Nessun pulsante e niente `nextEpisode=1` | — | Nessun cambio, notifica di fine serie | — |
| D6 | Overlay o pubblicità che coprono il pulsante | Il clic sintetico non viene coperto; se il sito ignora il clic → D3 | Parziale | D3 | Un overlay che blocca la navigazione richiede l'utente |
| D7 | Cambio che richiede una conferma del sito | Come D3 | No | D3 | L'estensione non clicca conferme sconosciute |
| E1 | Estensione aggiornata o ricaricata | Gli script già nelle pagine perdono il collegamento | Sì | Ricaricare la pagina dell'episodio (indicato nel README) | Limite del browser |
| E2 | Service worker fermato | — | Sì | Nessuno stato in variabili globali: tutto in `chrome.storage` | — |
| E3 | Menu chiuso | — | Sì | Lo stato della scheda resta in `chrome.storage.session` | — |
| E4 | Pagina ricaricata o uscita dal sito | `pagehide` | Sì | Lo stato della scheda viene azzerato; il player chiuso è segnato "chiuso" | — |
| E5 | Dati vecchi in storage | Età dei dati | Sì | `pendingPlayAt` vale 30 s, `resume` 90 s e solo per lo stesso episodio, timer di fine episodio/stagione 12 ore | — |
| E6 | Tentativi simultanei | — | — | Un solo cambio alla volta (`switching`), una sola ricarica per episodio, conto alla rovescia unico | — |

## Tabella dei fallback

Sito/provider di tutte le righe: **StreamingCommunity con player vixcloud.co o vixcloud.cc (JW Player 8, `<video>` HTML5)**.

| Problema | Rilevamento | Tentativo automatico | Fallback successivo | Limiti | Esito verificabile | Stato |
|---|---|---|---|---|---|---|
| Video bloccato | 12 s senza avanzamento | Salto di 1 s | Ricarica dell'episodio con `minute=` e ripresa al secondo | Una ricarica ogni 3 min | Il tempo avanza di nuovo (evento "riuscito") | Verificato sul sito di prova |
| Ancora bloccato dopo la ricarica | Seconda richiesta entro 3 min | — | Avviso, notifica, stato "serve un'azione" | — | Evento di errore | Verificato sul sito di prova (meccanismo); non su blocchi reali |
| La pagina del sito non raccoglie la ricarica | Nessuna conferma da `recovery.js` | — | Avviso e notifica: ricaricare a mano | — | Evento di errore | Implementato, non verificato |
| Errore del video dopo l'avvio (2, 3, 4) | `MediaError.code` | Ricarica | Come sopra | — | Il tempo avanza dopo la ricarica | Implementato, non verificato |
| Errore del video prima dell'avvio | `MediaError.code` | — | Avviso "ricarica la pagina" | Una ricarica automatica potrebbe ripetersi a vuoto | Evento | Implementato, non verificato |
| Avvio con audio rifiutato | `NotAllowedError` | Avvio senza audio | Se rifiutato anche così: avviso "premi play" | Regola del browser, non si aggira | Il video parte | Avvio con audio grazie al permesso: verificato sul sito reale (1.0–1.1). Ripiego senza audio e avviso: implementati, non verificati |
| Avvio rifiutato o player in pausa con la scheda nascosta (browser ridotto a icona) | `play()` rifiutato o `pause` nei primi 90 s, `document.hidden` | Fino a 6 nuovi `play()` con attese crescenti (circa un minuto), dalla 1.6.0 | Notifica "nuovo episodio pronto" e avvio al ritorno sulla scheda | Il browser decide se un video può partire in background; un video muto può essere fermato dal browser | Evento `playing` ("partito con la scheda nascosta") | Implementato, non verificabile qui (Playwright tiene le schede sempre visibili) |
| Pulsante "prossimo episodio" in ritardo | Assente con `nextEpisode=1` | Attesa 3 s | Notifica "pulsante non trovato" | — | Pulsante trovato | Verificato sul sito di prova (caso assente) |
| Clic senza effetto | Player ancora vivo dopo 15 s | Secondo clic | Avviso con **Riprova**, notifica | Due clic al massimo | Il nuovo episodio arriva | Verificato sul sito di prova |
| Player senza video | 30 s senza video | — | Stato "non compatibile", evento | — | Compare il video | Verificato sul sito di prova |
| Pagina dell'episodio senza player | 15 s senza iframe vixcloud | — | Evento, Verifica tutto lo segnala | Pagine del sito non leggibili oltre il DOM | Il player compare | Verificato sul sito di prova |

**Non implementabili** (e perché): leggere gli errori interni di hls.js o di JW Player (vivono nel mondo della pagina, non accessibile agli script dell'estensione senza iniettare codice nella pagina, cosa che non facciamo); riconoscere l'immagine ferma con l'audio che va (nessuna API); riconoscere automaticamente intro e titoli dalle immagini (l'estensione non analizza il video, resta il sistema a tempi segnati da te); aggirare la regola del browser sull'avvio con audio (va rispettata: serve un gesto dell'utente).

## Configurazioni per serie

Intro e titoli si salvano per **titolo della serie** (parametro `t` dell'URL del player); la stagione si legge da `S<n>:` nel nome dell'episodio. Limite noto: due serie con lo stesso titolo (per esempio un remake) condividono i segni. L'indirizzo della pagina principale ha un identificativo numerico (`/watch/<id>`) che le distinguerebbe, ma il player sta in un'altra origine e non lo vede: servirebbe passarlo tramite il service worker. Non lo si è fatto in questa versione per non cambiare la chiave dei dati già salvati; è in [TODO.md](../TODO.md).

