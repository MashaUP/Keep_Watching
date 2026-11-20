# Keep Watching — piano di test

## Comandi

| Comando | Cosa fa | Dove gira |
|---|---|---|
| `npm ci` | Installa ESLint (unica dipendenza, solo di sviluppo) | Ovunque, Node 22 |
| `npm run check` | `scripts/check.mjs`: versioni allineate (manifest, `package.json`, `package-lock.json`, `version.json`), sezione del CHANGELOG, file del manifest, `importScripts`, permessi attesi, domini del player uguali in `hosts.js`, manifest e `rules.json`, sintassi JS, JSON validi, `links.json` e `version.json` nel formato comune e coerenti con `links.js`, SHA-256 dello zip nella radice, un solo zip, README senza versioni vecchie e sotto le 220 righe, nessuna richiesta di rete non prevista, `innerHTML` senza dati, nessun segreto, file minimi presenti | CI e release |
| `npm run lint` | ESLint (`no-undef`, `no-unused-vars` e regole consigliate); conosce le dichiarazioni condivise tra gli script classici | CI e release |
| `npm test` | `check` + `lint` + test di unità | CI a ogni push, release |
| `npm run test:e2e` | Test end-to-end con Playwright (Python) su un sito di prova | Solo in locale |
| `npm run build` / `npm run package` | Pacchetti (vedi [RELEASE.md](RELEASE.md)) | CI (build), in locale (package) |

Prima del pacchetto `npm run check` avvisa soltanto se manca lo zip della versione nella radice; in release (`STRICT=1`) è un errore.

## Cosa provano i test

**Test di unità** (`node --test`, dentro `npm test`). Coprono `defaults.js` (validazione, categorie, profili, scorciatoie), `lib/stats.js` (misura, sessioni, mezzanotte, completamenti, CSV, JSON, importazione), `lib/updates.js` (confronto delle versioni, changelog, `version.json` con SHA-256 e note, risposte simulate di `raw.githubusercontent.com`: aggiornato, nuova versione, senza zip, senza note, CHANGELOG assente, rete assente, limite 403/429, 404, file non valido), `lib/links.js` (formato comune, host per collegamento, voce per voce, cache, `links.json` uguale ai valori di serie), `lib/health.js` e `hosts.js`.

**Test end-to-end** (Python 3, Playwright con Chromium, ffmpeg per creare i video di prova, `xvfb-run` se non c'è uno schermo):

```
npm run test:e2e          # oppure: bash tests/e2e/run_all.sh
```

`server.py` simula il sito (pagina, iframe intermedio, player su `vixcloud.co` reindirizzato a 127.0.0.1) e risponde a `/__config` per cambiare numero di episodi, blocchi dello streaming, pulsante mancante e durata del video. `kw.py` carica una copia dell'estensione con gli Shadow DOM aperti e sostituisce `raw.githubusercontent.com` con risposte finte. File:

| Test | Cosa prova |
|---|---|
| `test_regression.py` | Conto alla rovescia (Annulla, Vai ora), domanda dopo N episodi, timer a tempo, fine episodio e fine stagione, interruttore e segni da scorciatoia, notifica "pulsante non trovato" |
| `test_quick_skip.py` | Salto avanti ripetuto, in pausa, a fine video, dopo la ricreazione dei controlli, da scorciatoia, ignorato mentre si scrive |
| `test_popups.py` | Categorie nascoste e "nascondi tutti" con le automazioni attive, limite in modo sicuro, recupero silenzioso |
| `test_stats.py` | Tempo reale, pause, velocità 2×, sessioni, completamenti, intro e titoli, raccolta spenta, azzeramento |
| `test_guide_ui.py` | Guida alle scorciatoie, Esc, chiusura automatica, aspetto della barra e scelta dei pulsanti sul player |
| `test_health.py` | Stato della scheda, Verifica tutto (anche non distruttiva), cambio riuscito e verificato, clic senza effetto (due clic, poi avviso), pagina senza player, player senza video, pagina non supportata, blocco e ripresa con esito, Centro salute e cronologia nel menu |
| `test_popup.py` | Menu: migrazione dalla 1.4.0, impostazioni, popup, pulsanti e aspetto della barra, profili, statistiche (grafico, CSV, JSON, importazione, azzeramento), centro aggiornamenti con `version.json` finto, novità, verifica dopo la ricarica, Ko-fi |
| `test_links.py` | Collegamenti: quattro icone piccole, elenco Community e aiuto con novità, segnalazioni e idee, `links.json` letto da `raw` (mai dall'API), Discord cambiato da remoto, voce spenta da remoto, cache, rete assente, indirizzi pericolosi o sull'host sbagliato, JSON rotto; opzione «Parti anche con il browser ridotto a icona» |

Opzioni del sito di prova per i guasti (`/__config`): `deadnext=1` (il pulsante c'è ma il clic non fa nulla), `noplayer=1` (pagina dell'episodio senza player), `novideo=1` (player senza video), `stall=1` (video che si blocca), `broken=1` (successivo dichiarato ma pulsante assente).


## Cosa NON è coperto

- Il sito e il player reali: tutte le funzioni dalla 1.2 sono provate sul sito di prova, che usa solo forme viste sul sito reale (struttura a tre livelli, classi di JW Player, parametri dell'URL). I guasti (`deadnext`, `noplayer`, `novideo`, `stall`, `broken`) sono simulati: il modo in cui il sito vero fallisce non è stato osservato.
- La scheda nascosta e il browser ridotto a icona: Chromium avviato da Playwright considera sempre visibili le sue schede.
- `chrome.runtime.reload()` dopo l'estrazione dello zip (in Chromium avviato da Playwright l'estensione ricaricata non torna disponibile).
- `raw.githubusercontent.com` e `github.com/…/raw/HEAD/…` veri: nei test le risposte sono finte.
- Brave (i test usano Chromium), Edge, le scorciatoie premute davvero e i conflitti con altre estensioni.
- I workflow di GitHub Actions (`ci.yml`, `release.yml`) e l'annuncio su Discord: si provano solo pubblicando.

## Prova a mano sul sito reale

Da fare su StreamingCommunity con Brave, con il menu aperto su **Centro salute** e **Cronologia** a portata di mano. Segna per ogni voce: superato, fallito, non eseguito.

1. Caricamento normale: Verifica tutto con sito, iframe, player, controlli, autoplay **Funzionante**.
2. Rilevamento del player: in cronologia "Player rilevato" con il nome dell'episodio.
3. Comparsa ritardata del player (rete lenta o pagina ricaricata): lo stato passa da "in caricamento" a "in riproduzione" senza errori.
4. Sostituzione dell'iframe (cambio episodio): nuovo "Player rilevato", nessun doppio cambio.
5. Cambio episodio automatico: "Cambio riuscito" in cronologia; nel nuovo episodio Verifica tutto dà prossimo episodio **Funzionante**.
6. Conto alla rovescia: compare, si consuma, cambia episodio.
7. Annulla del conto alla rovescia: nessun cambio, evento "annullato da te".
8. Salto intro segnato: evento "Intro saltata"; Verifica tutto lo dà **Funzionante** nell'episodio.
9. Salto dei titoli: evento "Titoli di coda" e cambio al momento giusto.
10. Riproduzione temporaneamente bloccata (rete scollegata per 15 s): "Video bloccato", salto, poi "ripartito" o ricarica con esito.
11. Buffering prolungato: l'evento dice "in attesa di dati".
12. Errore recuperabile: ricarica e ripresa al secondo giusto, esito "riuscita".
13. Errore non recuperabile (rete scollegata a lungo): niente ricariche a ripetizione, avviso "ricarica la pagina".
14. Refresh della pagina: lo stato della scheda riparte, nessun dato vecchio nel menu.
15. Ricarica dell'estensione da `brave://extensions`: dopo aver ricaricato la pagina tutto torna **Funzionante**.
16. Popup aperto e chiuso durante la visione: lo stato resta.
17. Preferenze dopo un aggiornamento: tutte uguali.
18. Verifica tutto durante la riproduzione: il video non si ferma, non salta, non cambia episodio.
19. Cronologia: esportazione JSON senza token o indirizzi completi; cancellazione.
20. Nessun tentativo infinito: con lo streaming fermo a lungo, al massimo un salto e una ricarica, poi l'avviso.
21. Browser ridotto a icona: con un episodio a pochi secondi dalla fine, riduci a icona e aspetta 2 minuti. In cronologia deve comparire "Nuovo episodio partito con la scheda nascosta" oppure, se il browser non lo consente, "Il nuovo episodio non parte con la scheda nascosta" con il motivo (mandalo per capire cosa lo blocca).
22. Collegamenti: le icone in basso a sinistra aprono GitHub, Discord, Ko-fi e la guida. Dopo aver caricato `links.json` su GitHub, cambia un indirizzo di prova, premi **Cerca aggiornamento** e controlla che il menu lo usi.
23. Aggiornamenti: **Cerca aggiornamento** con il repository pubblico mostra la versione pubblicata senza errori; **Scarica aggiornamento** scarica lo zip da GitHub.

### Controlli di funzione (con DevTools)

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
- [ ] "+60 s" resta sulla barra per tutto l'episodio e funziona 5 volte di seguito; con un'altra durata scelta nel menu l'etichetta cambia subito.
- [ ] Alt+Shift+→, Alt+Shift+S e Alt+Shift+H funzionano sul player; scrivendo nella ricerca del sito non fanno nulla; Alt+Shift+K invariata.
- [ ] La guida (Alt+Shift+H) segnala le scorciatoie non assegnate; Esc la chiude.
- [ ] "Nascondi tutti i popup sul video": il cambio episodio avviene senza riquadro; spegnendolo le categorie tornano come prima.
- [ ] Profilo Notturno: menu "Personalizzato" dopo una modifica, "Ripristina il profilo" la annulla.
- [ ] Aspetto: opacità, posizione e dimensione si vedono sul player senza ricaricare.
- [ ] Pulsanti sulla barra: spegnendone uno sparisce dal player senza ricaricare; con tutti spenti la barra non compare e le scorciatoie funzionano.
- [ ] Statistiche: dopo qualche minuto di visione il tempo cresce, la pausa non lo fa crescere; esportazione CSV aperta in Excel con le lettere accentate corrette.
- [ ] "Cerca aggiornamento" con il repository pubblico reale: versione installata, ultima pubblicata, nessun errore.
- [ ] Aggiornamento completo: scarica lo zip, estrai sopra la cartella, "Ho estratto lo zip: ricarica l'estensione", riapri il menu e controlla "Aggiornamento installato".
- [ ] Il link Ko-fi apre https://ko-fi.com/mashaup in una nuova scheda.

Per portare rapidamente un episodio alla fine, trascina la barra di avanzamento agli ultimi secondi.

## Audit della 1.4.1 (storico)

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

### Problemi trovati e corretti nella 1.5.0 (ognuno con il suo test)

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

