# Keep_Watching — compatibilità, guasti e piani di ripresa

Documento dalla versione 1.5.0. Raccoglie l'audit del codice, i siti e i player effettivamente supportati, la matrice dei guasti, la tabella dei fallback e la macchina a stati del player. Per l'uso quotidiano basta il [README](../README.md); per i dettagli tecnici del sito c'è [MANUTENZIONE.md](MANUTENZIONE.md).

**Come leggere i livelli di verifica**

| Livello | Significato |
|---|---|
| Verificato sul sito reale | Osservato su StreamingCommunity durante lo sviluppo (settembre 2026, JW Player 8.36.4). Il sito può essere cambiato da allora. |
| Verificato sul sito di prova | Provato dai test automatici su `tests/e2e/server.py`, un sito finto con la stessa struttura a tre livelli e le stesse classi di JW Player. Non sostituisce una prova sul sito reale. |
| Implementato, non verificato | Il codice esiste ma nessun test lo ha esercitato. |
| Non verificabile qui | L'ambiente di sviluppo non può riprodurlo (sito reale, GitHub reale, Brave reale, scheda nascosta). |

## 1. Siti e player supportati

Un solo sito e un solo player. Nessun altro servizio è supportato e l'estensione non prova a riconoscerne altri.

| Elemento | Valore |
|---|---|
| Sito | StreamingCommunity (il dominio principale cambia spesso: non viene usato) |
| Riconoscimento della pagina | Percorso `…/watch/<id>` (pagina principale) e `…/iframe/<id>` (iframe intermedio), **più** la presenza dell'iframe del player su `vixcloud.co` |
| Player | `vixcloud.co/embed/<id>` o `vixcloud.cc/embed/<id>` (e loro sottodomini; il sito è passato a vixcloud.cc nell'ottobre 2026), JW Player 8 con hls.js e `<video>` HTML5. Elenco in `src/hosts.js` |
| Dove sta il player | In un iframe di un'altra origine, dentro l'iframe intermedio del sito |
| Dati dall'URL del player | `t` titolo (base64), `d` episodio "S1:E2 Nome" (base64), `nextEpisode=1` se c'è un successivo, `minute=N` punto di partenza |
| Dati dal DOM del player | `.jwplayer` (contenitore), `.jw-controlbar .next-episode` (prossimo episodio), `.jw-icon-fullscreen` |
| Cosa viene ricreato | A ogni episodio: l'iframe intermedio e il player (documento nuovo). La pagina principale no (navigazione interna, cambia `?e=`) |
| Richiede un gesto dell'utente | Il primo avvio con audio (regola del browser); lo schermo intero vero |
| Dipende dal browser | Autoplay con audio (permesso `allow="autoplay"` sull'iframe), schermo intero, timer rallentati nelle schede nascoste |

**Domini.** Gli script delle pagine del sito girano su qualsiasi dominio con `/watch/` o `/iframe/` nel percorso, perché il sito cambia dominio. Non per questo un dominio qualunque è "riconosciuto": `autoplay-permission.js` modifica solo iframe il cui indirizzo è esattamente su `vixcloud.co` (dalla 1.5.0 con un controllo sull'host, prima bastava la parola "vixcloud" in un punto qualsiasi dell'indirizzo), e `site-health.js` dichiara riconosciuta una pagina solo se contiene l'iframe dell'episodio. Una pagina con `/watch/` ma senza quella struttura compare in cronologia come "pagina /watch/ senza l'iframe dell'episodio" e non viene toccata. Le pagine di errore o di manutenzione del sito (iframe dell'episodio senza player) vengono segnalate dopo 15 secondi.

**Browser.** Brave e Chrome per computer (Chromium, Manifest V3). Edge e altri Chromium non sono stati provati. Firefox non è supportato: il manifest usa il service worker e `declarativeNetRequest` nella forma di Chrome, e non è stato verificato altrove.

## 2. Audit della 1.4.1: stato delle funzioni

| Funzione | Stato prima della 1.5.0 | Note |
|---|---|---|
| Permesso di autoplay al player | Fragile o dipendente dal sito | Verificato sul sito reale. Dipende dai percorsi `/watch/` e `/iframe/` |
| Prossimo episodio automatico | Parzialmente funzionante | Verificato sul sito reale; il clic non veniva verificato (vedi problemi 2 e 3) |
| Conto alla rovescia annullabile (5–20 s) | Funzionante | Verificato sul sito di prova |
| Domanda dopo N episodi | Funzionante | Verificato sul sito di prova |
| Salto intro per serie | Funzionante | Verificato sul sito di prova |
| Titoli di coda (15 s–2 min, personalizzato, soglia 60 s) | Funzionante | Verificato sul sito di prova |
| Timer di spegnimento (tempo, episodio, stagione) | Parzialmente funzionante | Riquadro chiuso per errore con il cambio automatico spento (problema 1) |
| Ripresa dello streaming bloccato | Parzialmente funzionante | Esito della ricarica mai verificato, errori non distinti (problemi 4–7) |
| Statistiche locali | Funzionante | Verificato sul sito di prova |
| Aggiornamenti da GitHub | Implementato, verificato con risposte simulate | GitHub reale non raggiungibile dall'ambiente |
| Scorciatoie e guida | Funzionante sul sito di prova | Tasti premuti davvero in Brave: non verificabile qui |
| Pausa quando cambi scheda | Implementato, non verificato | L'ambiente non nasconde le schede |
| Diagnostica | Non implementata | Solo messaggi nella console del player |

### Problemi trovati e corretti nella 1.5.0

1. **Riquadri chiusi da qualsiasi scrittura nello storage.** Con il cambio automatico spento (o l'estensione sospesa), ogni modifica di `chrome.storage.local` (le statistiche la fanno ogni 15 secondi) chiudeva il riquadro aperto: anche "Timer di spegnimento — Riprendi" o "Intro saltata". Ora si reagisce solo al cambio di quelle due opzioni e si chiudono solo i riquadri del cambio episodio. Test: `test_regression.py`.
2. **Clic su "prossimo episodio" senza verifica.** Se il clic non produceva il cambio (sito cambiato, overlay), non succedeva nulla e nessuno lo sapeva. Ora, se dopo 15 secondi il player è ancora lo stesso documento, si fa un secondo clic; se anche questo non ha effetto, il player lo dice ("Cambio episodio non riuscito", con **Riprova**), lo registra e manda una notifica se la scheda è nascosta. Mai più di due clic automatici. Test: `test_health.py`.
3. **Pulsante "prossimo episodio" disattivato o comparso in ritardo.** Il pulsante veniva usato anche se disattivato, e se non c'era ancora a fine episodio si concludeva subito che mancasse. Ora si ignora un pulsante disattivato e, se il player dice che c'è un successivo, lo si aspetta fino a 3 secondi.
4. **Ricarica dell'episodio "nel vuoto".** Se nessuna pagina del sito raccoglieva la richiesta di ricarica (percorso cambiato), il player non lo sapeva. Ora `recovery.js` conferma e, senza conferma, il player chiede di ricaricare a mano.
5. **Salto di recupero con durata sconosciuta.** Con `duration` NaN il salto di 1 secondo diventava `currentTime = NaN` (errore). Corretto.
6. **Ogni errore del video provocava una ricarica**, anche l'interruzione dovuta a un cambio pagina (codice 1). Ora gli errori sono classificati per codice; senza che il video sia mai partito non si ricarica (rischio di girare a vuoto), si dice cosa fare.
7. **Ripresa mai verificata.** Dopo la ricarica si dava per riuscita la ripresa. Ora il recupero è "riuscito" solo se il video torna davvero ad avanzare entro 20 secondi; altrimenti è registrato come fallito.
8. **Avvio bloccato dal browser** (`NotAllowedError` anche senza audio) registrato solo in console. Ora diventa uno stato "serve un'azione" con un avviso sul player.
9. **Riconoscimento del player troppo largo.** Bastava la parola "vixcloud" nell'indirizzo dell'iframe. Ora serve uno degli host dell'elenco (`src/hosts.js`).
10. **Messaggi senza controllo del mittente.** Azzeramento e importazione delle statistiche erano accettati da qualsiasi script dell'estensione, anche quelli nelle pagine del sito. Ora le operazioni che cancellano dati (e Verifica tutto) sono accettate solo dalle pagine dell'estensione; ogni messaggio deve venire dall'estensione stessa.
11. **Icone come caratteri** (▶ ✓ ⏾ ?) nei riquadri del player: sostituite da icone vettoriali.

### Controlli senza problemi

- **Listener:** tutti registrati una sola volta per documento; il player è un documento nuovo a ogni episodio, quindi non si accumulano. La barra usa un solo listener delegato.
- **Timer:** nel player due intervalli (sorveglianza ogni 2 s, statistiche ogni 15 s) che finiscono con il documento; i timeout (verifica del cambio, verifica della ricarica, attesa del video) sono singoli e cancellati quando serve. In `cinema.js` l'intervallo gira solo a modalità attiva.
- **Observer:** uno solo, in `autoplay-permission.js`, su `src` e nodi aggiunti; serve finché la pagina vive.
- **Permessi:** invariati (`storage`, `notifications`, `declarativeNetRequest`). Verifica tutto non usa `webNavigation` né `tabs`: ogni frame risponde con un messaggio proprio.
- **Codice eseguito:** nessun `eval`, nessun codice remoto. `innerHTML` solo con modelli fissi; i testi dinamici passano da `textContent`.
- **Duplicazione nota:** il controllo "si sta scrivendo in un campo" è sia in `player.js` sia in `cinema.js`, perché girano in pagine diverse.

## 3. Macchina a stati del player

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

## 4. Matrice dei guasti (StreamingCommunity + vixcloud/JW Player 8)

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

## 5. Tabella dei fallback

Sito/provider di tutte le righe: **StreamingCommunity con player vixcloud.co o vixcloud.cc (JW Player 8, `<video>` HTML5)**.

| Problema | Rilevamento | Tentativo automatico | Fallback successivo | Limiti | Esito verificabile | Stato |
|---|---|---|---|---|---|---|
| Video bloccato | 12 s senza avanzamento | Salto di 1 s | Ricarica dell'episodio con `minute=` e ripresa al secondo | Una ricarica ogni 3 min | Il tempo avanza di nuovo (evento "riuscito") | Verificato sul sito di prova |
| Ancora bloccato dopo la ricarica | Seconda richiesta entro 3 min | — | Avviso, notifica, stato "serve un'azione" | — | Evento di errore | Verificato sul sito di prova (meccanismo); non su blocchi reali |
| La pagina del sito non raccoglie la ricarica | Nessuna conferma da `recovery.js` | — | Avviso e notifica: ricaricare a mano | — | Evento di errore | Implementato, non verificato |
| Errore del video dopo l'avvio (2, 3, 4) | `MediaError.code` | Ricarica | Come sopra | — | Il tempo avanza dopo la ricarica | Implementato, non verificato |
| Errore del video prima dell'avvio | `MediaError.code` | — | Avviso "ricarica la pagina" | Una ricarica automatica potrebbe ripetersi a vuoto | Evento | Implementato, non verificato |
| Avvio con audio rifiutato | `NotAllowedError` | Avvio senza audio | Se rifiutato anche così: avviso "premi play" | Regola del browser, non si aggira | Il video parte | Avvio con audio grazie al permesso: verificato sul sito reale (1.0–1.1). Ripiego senza audio e avviso: implementati, non verificati |
| Avvio rifiutato con la scheda nascosta | `play()` rifiutato, `document.hidden` | — | Nuovo avvio al ritorno sulla scheda | — | Il video parte | Implementato, non verificabile qui |
| Pulsante "prossimo episodio" in ritardo | Assente con `nextEpisode=1` | Attesa 3 s | Notifica "pulsante non trovato" | — | Pulsante trovato | Verificato sul sito di prova (caso assente) |
| Clic senza effetto | Player ancora vivo dopo 15 s | Secondo clic | Avviso con **Riprova**, notifica | Due clic al massimo | Il nuovo episodio arriva | Verificato sul sito di prova |
| Player senza video | 30 s senza video | — | Stato "non compatibile", evento | — | Compare il video | Verificato sul sito di prova |
| Pagina dell'episodio senza player | 15 s senza iframe vixcloud | — | Evento, Verifica tutto lo segnala | Pagine del sito non leggibili oltre il DOM | Il player compare | Verificato sul sito di prova |

**Non implementabili** (e perché): leggere gli errori interni di hls.js o di JW Player (vivono nel mondo della pagina, non accessibile agli script dell'estensione senza iniettare codice nella pagina, cosa che non facciamo); riconoscere l'immagine ferma con l'audio che va (nessuna API); riconoscere automaticamente intro e titoli dalle immagini (l'estensione non analizza il video, resta il sistema a tempi segnati da te); aggirare la regola del browser sull'avvio con audio (va rispettata: serve un gesto dell'utente).

## 6. Configurazioni per serie

Intro e titoli si salvano per **titolo della serie** (parametro `t` dell'URL del player); la stagione si legge da `S<n>:` nel nome dell'episodio. Limite noto: due serie con lo stesso titolo (per esempio un remake) condividono i segni. L'indirizzo della pagina principale ha un identificativo numerico (`/watch/<id>`) che le distinguerebbe, ma il player sta in un'altra origine e non lo vede: servirebbe passarlo tramite il service worker. Non lo si è fatto in questa versione per non cambiare la chiave dei dati già salvati; è tra le proposte qui sotto.

## 7. Proposte per le prossime versioni

| Priorità | Proposta | Perché | Rischio |
|---|---|---|---|
| Alta | Prova sul sito reale delle novità 1.5.0 (checklist in MANUTENZIONE) | Tutto il recupero è stato provato solo sul sito di prova | — |
| Alta | Selettori alternativi per "prossimo episodio" scelti dopo averli visti sul sito reale | Oggi c'è un solo selettore | Un selettore sbagliato cliccherebbe il pulsante sbagliato: va scelto guardando il sito, non inventato |
| Media | Serie identificate dall'id della pagina `/watch/<id>` oltre al titolo | Evita che due serie omonime condividano intro e titoli | Migrazione dei dati salvati |
| Media | Esportazione unica "pacchetto diagnostico" (cronologia + ultima Verifica tutto) | Più semplice da allegare a una segnalazione | — |
| Bassa | Statistiche per mese | I dati giornalieri già lo permettono | — |
| Bassa | Prova su Edge | Stesso motore, ma non verificato | — |
