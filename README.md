# Keep Watching

Estensione per Brave e Chrome che su StreamingCommunity passa da sola all'episodio successivo quando quello corrente finisce, e lo fa partire con l'audio. Salta intro e titoli di coda serie per serie, ha un timer di spegnimento, fa ripartire lo streaming quando si blocca e tiene statistiche di visione solo sul tuo computer. Quando qualcosa non va, il **Centro salute** dice cosa funziona davvero e la **Cronologia** cosa è successo.

Versione 1.6.1 · Licenza MIT · Nel browser si chiama **Keep Watching**; repository, cartella e zip si chiamano `Keep_Watching`.

> **Importante:** il browser lascia partire l'audio da solo solo dopo un tuo click sulla pagina. Apri l'episodio e premi play una volta: da lì in poi fa tutto l'estensione.

## Cosa fa

- **Prossimo episodio automatico** con un conto alla rovescia sul player (**Annulla**, **Vai ora**), anche a schermo intero. Sull'ultimo episodio non fa nulla.
- **Il nuovo episodio parte da solo e con l'audio**, anche se cambi episodio a mano: il sito non darebbe al player il permesso, l'estensione glielo aggiunge.
- **Intro e titoli per serie:** premi **Fine intro qui** e **Inizio titoli qui** sul player una volta; dagli episodi successivi l'intro si salta da sola e il cambio parte all'inizio dei titoli. Per le altre serie: da 15 secondi a 2 minuti prima della fine, o un anticipo a piacere.
- **Salto avanti** (**+60 s**, durata da 15 a 90 s), sempre disponibile e ripetibile.
- **Timer di spegnimento:** tra 15–90 minuti, a fine episodio o a fine stagione, con il volume che si abbassa negli ultimi 30 secondi. **Chiedi se continuare dopo N episodi** di fila.
- **Profili** Normale, Notturno, Maratona e Manuale; **popup sul video** nascondibili per categoria; **barra sul player** con i pulsanti e l'aspetto che scegli tu.
- **Scorciatoie** con una guida sul player (**Alt+Shift+H**).
- **Streaming bloccato:** dopo 12 secondi fermo fa un salto di 1 secondo; se non basta ricarica l'episodio dal secondo in cui eri. Tentativi pochi e contati, esito verificato.
- **Finestra ridotta a icona:** cambia episodio comunque e, se il nuovo episodio non parte, riprova per circa un minuto.
- **Notifiche sul desktop**, badge sull'icona, **resta a schermo intero** tra un episodio e l'altro (si esce con **Esc**).
- **Statistiche locali** con grafico ed esportazione CSV/JSON; **Centro salute** con **Verifica tutto**; **Cronologia** eventi esportabile.
- **Cerca aggiornamento:** controlla sul repository se c'è una versione nuova, mostra le novità e scarica lo zip.

Funziona su Brave e Chrome per computer (Edge e altri Chromium non provati; Firefox non supportato), con StreamingCommunity su qualsiasi dominio e il player su vixcloud.co o vixcloud.cc. Le funzioni di base sono verificate sul sito reale; le altre su un sito di prova con la stessa struttura (dettagli in [docs/SITE_NOTES.md](docs/SITE_NOTES.md)).

## Installazione

1. Scarica `Keep_Watching-1.6.1.zip` dalla radice del repository (o dalla release) ed estrailo con **Estrai qui**: ottieni la cartella `Keep_Watching` con dentro `manifest.json`. Mettila in un posto dove resta: il browser la carica da lì ogni volta.
2. Apri `brave://extensions` (su Chrome `chrome://extensions`) e attiva **Modalità sviluppatore**.
3. **Carica estensione non pacchettizzata** e scegli la cartella `Keep_Watching`.
4. Dall'icona del puzzle fissa Keep Watching con la puntina: menu e badge restano a portata di mano.

Il browser crea nella cartella una sottocartella `_metadata`: è normale (copia precompilata di `rules.json`).

**Verifica:** apri un episodio, poi il menu di Keep Watching › **Centro salute** › **Verifica tutto**. Le voci devono essere **Funzionante**, salvo quelle che si verificano solo quando scattano (il primo cambio episodio, il salto dei titoli) e quelle che hai spento.

### Permessi

Il browser avvisa che l'estensione può **leggere e modificare i dati su tutti i siti**: il sito cambia dominio, quindi l'estensione si aggancia al percorso delle pagine (`/watch/`, `/iframe/`). Agisce solo sulle pagine degli episodi e sul player.

| Permesso | Perché |
|---|---|
| `storage` | Opzioni, serie, timer, statistiche, cronologia |
| `notifications` | Notifiche sul desktop |
| `declarativeNetRequest` | Bloccare il primo caricamento del player, che parte senza permesso di autoplay, così che l'estensione lo rifaccia con il permesso |
| Pagine `*/watch/*`, `*/iframe/*` e player `vixcloud.co`, `vixcloud.cc` | Permesso di autoplay, schermo intero tra episodi, ripresa dello streaming, controllo del player |

### Scorciatoie

Controllale in `brave://extensions/shortcuts` (su Chrome `chrome://extensions/shortcuts`).

| Comando | Di serie |
|---|---|
| Attiva o sospendi | **Alt+Shift+K** |
| Salto avanti | **Alt+Shift+→** |
| Salta intro | **Alt+Shift+S** |
| Guida alle scorciatoie | **Alt+Shift+H** |
| Segna fine intro, Segna inizio titoli, Stop a fine episodio | nessuna: sceglila tu |

Il browser non assegna una combinazione già usata da un'altra estensione: il menu (**Riproduzione › Scorciatoie da tastiera**) e la guida segnalano quelle mancanti. Le scorciatoie non fanno nulla mentre scrivi in un campo di testo. **Shift** è **Maiusc**.

## Aggiornare

1. Menu › **Aggiornamenti** › **Cerca aggiornamento**. Se c'è una versione nuova, leggi le novità e premi **Scarica aggiornamento**.
2. Estrai lo zip **nella stessa cartella** della versione attuale, sostituendo i file.
3. Premi **Ho estratto lo zip: ricarica l'estensione**, poi ricarica la pagina dell'episodio.
4. Riapri il menu: in **Panoramica** compare «Aggiornamento installato» solo se la versione è cambiata davvero.

L'estensione non installa niente da sola e non esegue codice scaricato. Il controllo automatico (una volta al giorno, all'apertura del menu) si spegne in **Aggiornamenti › Preferenze**. A mano: estrai lo zip sopra la cartella e premi l'icona di ricarica in `brave://extensions`. Se una versione chiede permessi nuovi, rimuovi l'estensione e caricala di nuovo: opzioni e statistiche si perdono (prima esporta le statistiche in JSON e reimportale dopo).

## Uso

1. Apri un episodio e premi play. A fine episodio compare il conto alla rovescia e poi parte il prossimo.
2. La prima volta che guardi una serie muovi il mouse sul video: **Fine intro qui** quando finisce l'intro, **Inizio titoli qui** quando iniziano i titoli.
3. Se pensi di addormentarti: profilo **Notturno** e un **timer di spegnimento**, oppure **Stop a fine episodio** sul player.

| Sezione del menu | Cosa contiene |
|---|---|
| **Panoramica** | Interruttore generale, stato della scheda, profilo, timer, episodi di fila, avviso di aggiornamento |
| **Riproduzione** | Cambio episodio, conto alla rovescia, limite di episodi, intro e titoli, serie salvate, salto avanti, timer, ripresa dello streaming, scorciatoie |
| **Interfaccia sul video** | Popup sul video per categoria (nasconderli non spegne le automazioni), pulsanti e aspetto della barra con anteprima, notifiche |
| **Profili** | Normale (di serie), Notturno (meno messaggi, volume abbassato), Maratona (conto alla rovescia di 5 s, meno conferme), Manuale (nessun cambio automatico). Dopo una modifica il menu scrive «Personalizzato» e offre **Ripristina il profilo** |
| **Centro salute** | Stato reale della scheda, **Verifica tutto** (senza toccare il video), ultimi problemi con il motivo |
| **Cronologia** | Eventi diagnostici (ultimi 300, uguali raggruppati), filtri, esportazione e cancellazione |
| **Statistiche** | Tempo di visione reale (pause e salti non contano), sessioni, episodi completati, intro e titoli saltati; oggi, 7 o 30 giorni; CSV (`;`, si apre in Excel) e JSON reimportabile; azzeramento |
| **Aggiornamenti** | Versione installata e pubblicata, **Cerca aggiornamento**, novità, registro delle versioni |
| **Sostieni** | Ko-fi e **Community e aiuto**: GitHub, Discord, guida, novità, segnala un problema, proponi un'idea |

| Opzione | Di serie |
|---|---|
| Prossimo episodio automatico, Avvia il nuovo episodio, Parti anche con il browser ridotto a icona | Attive |
| Conto alla rovescia (5, 10, 15, 20 s o cambio immediato) | 10 secondi |
| Chiedi se continuare dopo (1, 2, 3, 5, 10 episodi) | Mai |
| Salta l'intro (nelle serie segnate) | Attivo |
| Salta i titoli di coda (15–120 s prima della fine o personalizzato) | No |
| Timer di spegnimento, con **Abbassa il volume prima** | Spento, dissolvenza attiva |
| Resta a schermo intero, Riparti se lo streaming si blocca, Notifiche sul desktop | Attive |
| Pausa quando cambi scheda | Spenta |

**Verifica tutto** dà a ogni voce uno di tre esiti: **Funzionante** (verificato adesso o già visto funzionare in questa scheda), **Da verificare** (pronto, ma si saprà solo quando scatta: il cambio episodio lo è finché non ne avviene uno), **Non disponibile** (spento da te, non supportato dalla pagina o in errore, con il motivo «noto» se lo dice il browser o «probabile» se è dedotto).

Il pulsante in basso a sinistra apre il menu in una scheda (più comodo per le statistiche, necessario per importare un file). Le icone piccole in basso a sinistra aprono GitHub, Discord, Ko-fi e la guida.

| Pulsante sul player | Quando compare | Cosa fa |
|---|---|---|
| **Salta intro** | Prima della fine dell'intro segnata | Salta alla fine dell'intro |
| **+60 s** | Sempre, tranne negli ultimi istanti | Avanti della durata scelta, anche in pausa |
| **Fine intro qui** / **Inizio titoli qui** | Primi / ultimi 10 minuti | Segna intro o titoli per questa serie |
| **Stop a fine episodio** | Sempre | Ferma il video a fine episodio invece di cambiare |
| **?** | Sempre | Guida alle scorciatoie |

Ogni pulsante si spegne in **Interfaccia sul video › Pulsanti sulla barra** (la scorciatoia resta). Intro e titoli si salvano per **titolo della serie**, i titoli come «secondi prima della fine». Il badge mostra **OFF** con l'estensione sospesa e **2/3** quando conta gli episodi di fila.

## Problemi comuni

Prima di tutto: **Centro salute › Verifica tutto** e **Cronologia › Solo errori**. Spesso il motivo è già scritto lì.

- **«Connessione negata da vixcloud» aprendo gli strumenti per sviluppatori:** protezione del player. In **Sources** premi **Ctrl+F8** e ricarica; apri gli strumenti dal menu del browser (F12 è bloccato).
- **Il player mostra una pagina di errore o non si carica:** probabilmente il sito ha cambiato il percorso delle pagine. Sospendi l'estensione (Alt+Shift+K) per guardare e segnalalo.
- **A fine episodio non succede niente:** controlla **Estensione attiva**, **Prossimo episodio automatico**, che il profilo non sia **Manuale** e che l'icona non mostri **OFF**. La notifica **pulsante non trovato** vuol dire che il sito ha cambiato la barra del player.
- **Non vedo il conto alla rovescia o altri messaggi:** in **Interfaccia sul video › Popup sul video** forse è acceso **Nascondi tutti i popup**. Le automazioni funzionano comunque.
- **Il nuovo episodio parte muto:** non hai mai cliccato sulla pagina: premi play a mano la prima volta. Se parte muto anche a mano, riattiva l'audio dal player (lo ricorda). Volume basso dopo il timer: rialzalo dal player.
- **L'intro non viene saltata:** opzione spenta, intro non segnata per quella serie o episodio ripartito da un punto preciso («continua a guardare»).
- **La barra non compare:** muovi il mouse sul video e controlla che i pulsanti siano accesi.
- **Bloccato a schermo intero:** **Esc** oppure **F11**.
- **Una scorciatoia non fa niente:** guardala nella guida (Alt+Shift+H) e assegnala in `brave://extensions/shortcuts`.
- **Cerca aggiornamento dice «version.json non trovato» o «limite»:** il repository deve essere pubblico; con il limite di GitHub riprova più tardi.
- **Dopo l'aggiornamento «La versione è ancora la …»:** lo zip non è stato estratto nella cartella caricata dal browser (il percorso è in `brave://extensions`).
- **«Cambio episodio non riuscito»:** il clic su «prossimo episodio» non ha avuto effetto due volte: premilo tu o ricarica la pagina.
- **«Player su un dominio non supportato» o «pagina dell'episodio senza player»:** il sito ha spostato o cambiato il player: l'estensione va aggiornata.
- **Non arrivano le notifiche:** controlla **Notifiche sul desktop** nel menu e le notifiche del browser nel sistema operativo.
- **Importare le statistiche dal popup non va:** la scelta del file chiude il popup: usa **Importa da una scheda**.
- **In console «A listener indicated an asynchronous response…»:** viene da un'altra estensione; quelli di Keep Watching iniziano con `[Keep_Watching]`.

Altri casi, lato tecnico: [docs/SITE_NOTES.md](docs/SITE_NOTES.md#risoluzione-dei-problemi-lato-tecnico).

## Segnalare un problema

1. Riproduci il problema, poi **Centro salute › Verifica tutto** e **Cronologia › Esporta JSON**.
2. Apri una segnalazione con **Sostieni › Segnala un problema** (modello su GitHub) o scrivi su Discord, con versione (in alto a sinistra nel menu), browser e il file.

Il file non contiene cookie, token o indirizzi completi, ma può contenere il nome della serie: controllalo prima di condividerlo.

## Limiti noti

- Solo StreamingCommunity con il player su vixcloud.co o vixcloud.cc: se il player cambia dominio serve una versione nuova (il Centro salute lo dice per nome).
- L'estensione vede solo gli effetti degli errori del player sul video, non si accorge di un'immagine ferma con il tempo che avanza e non riconosce intro e titoli dalle immagini. Due serie con lo stesso titolo condividono i segni.
- Il primo avvio con audio richiede un tuo click: è una regola del browser e non viene aggirata. Con la scheda nascosta il browser rallenta i timer.
- Le funzioni dalla 1.5 in poi sono provate su un sito di prova; la prova completa sul sito reale è in [docs/TEST_PLAN.md](docs/TEST_PLAN.md#prova-a-mano-sul-sito-reale).

## Privacy

Nessuna telemetria: impostazioni, statistiche e cronologia restano nel browser. Le uniche richieste proprie vanno a GitHub (`version.json`, `CHANGELOG.md`, `links.json` e lo zip), senza cookie né dati. Dettagli in [SECURITY.md](SECURITY.md).

## Collegamenti e sviluppo

- Repository: https://github.com/MashaUP/Keep_Watching · Discord: https://discord.gg/EPsbQCuAkx · Ko-fi: https://ko-fi.com/mashaup
- Sviluppo: Node 22, `npm ci`, `npm test` (controlli, ESLint, test di unità), `npm run test:e2e` (Python, Playwright, ffmpeg), `npm run package`. Documenti: [architettura](docs/ARCHITECTURE.md), [piano di test](docs/TEST_PLAN.md), [rilascio e collegamenti](docs/RELEASE.md), [note sul sito](docs/SITE_NOTES.md), [cose da fare](TODO.md).
- Progetto personale, non affiliato a StreamingCommunity né a JW Player. Icona disegnata da `tools/make_icons.py` sul modello dell'autore; icone del menu disegnate a mano in SVG. Keep Watching è gratis: se ti è utile puoi offrire un caffè su Ko-fi.
