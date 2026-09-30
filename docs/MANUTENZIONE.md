# Manutenzione di Keep_Watching

Guida tecnica per capire come funziona l'estensione, cosa può rompersi quando il sito cambia e come diagnosticare i problemi. Ogni informazione qui è stata verificata sul sito durante lo sviluppo (settembre 2026, JW Player 8.36.4).

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
- **Protezione anti-DevTools** nel player: vedi [sezione 5](#5-fare-debug-sul-sito).

## 2. Componenti dell'estensione

| File | Dove gira | Compito |
|---|---|---|
| `src/player.js` | Player (`vixcloud.co/embed/*`) | Rileva la fine dell'episodio, clicca "prossimo episodio", avvia il nuovo episodio |
| `src/autoplay-permission.js` | Pagine del sito (`*/iframe/*`, `*/watch/*`) | Aggiunge `allow="autoplay"` all'iframe del player e lo ricarica con il marcatore |
| `rules.json` | Rete del browser | Blocca il caricamento del player senza marcatore `kw_autoplay=1` |
| `src/defaults.js` | Player e popup | Opzioni predefinite; documenta tutte le chiavi di `chrome.storage.local` |
| `src/popup/*` | Menu dell'icona | Legge e salva le opzioni |

### Flusso di un cambio episodio

1. Il video finisce: `player.js` riceve l'evento `ended` (oppure `timeupdate` se "salta i titoli di coda" è attivo).
2. `player.js` controlla il limite "fermati dopo", salva `pendingPlayAt` in `chrome.storage.local` e clicca `.next-episode`.
3. Il sito aggiorna l'URL della pagina principale e ricarica l'iframe intermedio.
4. Nell'iframe intermedio, il browser inizia a caricare il player; `rules.json` blocca la richiesta.
5. `autoplay-permission.js` aggiunge `allow="autoplay; fullscreen"` all'iframe e reimposta l'URL con `&kw_autoplay=1`: la regola lo lascia passare.
6. Il player si carica con il permesso. Di solito JW Player parte da solo; se resta in pausa, `player.js` legge `pendingPlayAt` (valido 30 secondi) e chiama `video.play()`.

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
| Classe `.next-episode` nella barra `.jw-controlbar` | `player.js` (`NEXT_SELECTOR`) | Log "Nessun pulsante prossimo episodio" anche a metà serie |
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

## 8. Rilasciare una nuova versione

1. Aggiorna `"version"` in `manifest.json` secondo il [Semantic Versioning](https://semver.org/lang/it/):
   - **patch** (1.0.**1**): correzione, per esempio un selettore o un dominio aggiornati;
   - **minor** (1.**1**.0): nuova opzione o funzionalità;
   - **major** (**2**.0.0): cambiamento di comportamento incompatibile.
2. Aggiungi una sezione in `CHANGELOG.md`.
3. Esegui la checklist di test qui sotto.
4. Crea il pacchetto: `powershell -ExecutionPolicy Bypass -File tools/package.ps1` (Windows) oppure `sh tools/package.sh` (Linux, macOS, Git Bash). Nella radice viene creato `Keep_Watching-<versione>.zip` con i soli file dell'estensione, e lo zip della versione precedente viene eliminato.
5. Aggiorna nel README il nome dello zip nella sezione Installazione e nella struttura del repository.
6. Commit, tag e push (lo zip va incluso nel commit):
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
- [ ] "Fermati dopo 1 episodio" si ferma al secondo finale e il conteggio compare nel menu.
- [ ] Sull'ultimo episodio disponibile compare `Nessun pulsante "prossimo episodio"` e non succede altro.
- [ ] Disattivando "Prossimo episodio automatico" l'episodio finisce senza cambi.

Per portare rapidamente un episodio alla fine, trascina la barra di avanzamento agli ultimi secondi.

## 9. Scelte tecniche e alternative scartate

- **Eventi del `<video>` invece dell'API di JW Player.** I content script girano in un ambiente isolato e non vedono l'oggetto `jwplayer` della pagina. Gli eventi del `<video>` invece sono condivisi. Gli eventi media non fanno bubbling, quindi si ascoltano in fase di capture sul `document`: così funziona anche se JW Player crea il `<video>` dopo lo script.
- **`element.click()` sul pulsante.** Verificato: JW Player reagisce al click sintetico sul pulsante `.next-episode`.
- **`video.play()` diretto per l'avvio.** Nelle prime versioni si cliccava il pulsante Play di JW e si aspettavano 3 secondi, interpretando il mancato avvio come un blocco dell'audio: era una deduzione sbagliata. Ora il fallback senza audio scatta solo con un `NotAllowedError` restituito dal browser.
- **Marcatore nella query e non nell'hash.** Le regole di rete non vedono il frammento `#…` dell'URL, quindi non potrebbero distinguere i due caricamenti.
- **Ricaricare il player senza bloccarlo prima: scartato.** La prima richiesta arriverebbe comunque al server, con il rischio di consumare il token.
- **Aggiungere il permesso dopo l'inserimento dell'iframe: non basta.** Vedi [sezione 3](#3-il-problema-dellautoplay-e-la-soluzione).
- **Script agganciati al percorso e non al dominio del sito.** Il dominio principale cambia periodicamente, mentre il percorso (`/it/iframe/`, `/it/watch/`) e il dominio del player sono rimasti stabili.
