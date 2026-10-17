# Keep_Watching

Estensione per Brave e Chrome che su StreamingCommunity passa da sola all'episodio successivo quando quello corrente finisce, e lo fa partire con l'audio. Salta l'intro e i titoli di coda serie per serie, ha un timer di spegnimento, fa ripartire lo streaming quando si blocca e tiene statistiche di visione solo sul tuo computer.

Versione 1.4.0

> **Importante:** il browser lascia partire l'audio da solo solo dopo un tuo click sulla pagina. Apri l'episodio e premi play una volta: da lì in poi fa tutto l'estensione.

## Come funziona

- **Prossimo episodio automatico:** a fine episodio l'estensione preme il pulsante "prossimo episodio" del player. Sull'ultimo episodio disponibile non fa nulla.
- **Conto alla rovescia:** prima del cambio compare sul player un riquadro "Prossimo episodio di …" con la barra che si consuma e i pulsanti **Annulla** e **Vai ora**. Si vede anche a schermo intero.
- **Il nuovo episodio parte da solo e con l'audio**, anche quando il cambio lo fai tu a mano. Il sito non darebbe al player il permesso di farlo: l'estensione glielo aggiunge.
- **Salta l'intro, serie per serie:** la prima volta premi **Fine intro qui** sul player; dagli episodi successivi della serie l'intro viene saltata da sola, con un riquadro "Intro saltata" e il pulsante **Annulla**.
- **Titoli di coda per serie:** con **Inizio titoli qui** il cambio episodio avviene quando iniziano i titoli di quella serie. Per le altre serie vale l'impostazione generale: da 15 secondi a 2 minuti prima della fine, oppure un anticipo a piacere in minuti e secondi.
- **Salto avanti:** il pulsante **+60 s** sul player resta disponibile per tutto l'episodio e si può premere più volte di seguito. La durata si sceglie tra 15, 30, 45, 60 e 90 secondi.
- **Timer di spegnimento:** il video si ferma tra 15, 30, 45, 60 o 90 minuti, alla fine dell'episodio o alla fine della stagione. Negli ultimi 30 secondi il volume si abbassa piano.
- **Chiedi se continuare dopo N episodi:** dopo 1, 2, 3, 5 o 10 episodi di fila il player chiede **Continua** o **Basta così**. Utile se ti addormenti.
- **Profili:** Normale, Notturno, Maratona e Manuale cambiano un gruppo di impostazioni in un colpo.
- **Popup sul video a scelta:** puoi nascondere i messaggi sul player per categoria, o tutti insieme, senza spegnere le automazioni.
- **Barra sul player personalizzabile:** dimensione, densità, opacità, posizione, tempo prima che sparisca, modalità minimale, animazioni ridotte.
- **Scorciatoie da tastiera** con una guida sul player (**Alt+Shift+H**) che mostra quali sono attive e quali mancano.
- **Statistiche locali:** tempo di visione, sessioni, episodi completati, intro e titoli saltati, con grafico ed esportazione in CSV o JSON.
- **Cerca aggiornamento:** il menu controlla sul repository GitHub ufficiale se c'è una versione nuova, mostra le novità e scarica lo zip.
- **Resta a schermo intero:** se guardi a schermo intero, ci resti anche nell'episodio successivo. Si esce con **Esc**.
- **Se lo streaming si blocca:** dopo 12 secondi fermo l'estensione fa un salto di 1 secondo; se non basta, ricarica l'episodio e lo riporta al secondo in cui eri.
- **Pausa quando cambi scheda** (facoltativa): il video si ferma e riparte quando torni.
- **Notifiche sul desktop:** serie finita, limite di episodi raggiunto, timer di spegnimento, streaming bloccato. Toccando la notifica si torna alla scheda.
- **Il dominio del sito può cambiare:** l'estensione non dipende dal dominio principale (`.fun`, `.xyz`…), ma dal percorso delle pagine e dal dominio del player.

Funziona su Brave e Chrome per computer. Non ha telemetria: impostazioni e statistiche restano nello spazio del browser. L'unica richiesta di rete è il controllo degli aggiornamenti verso GitHub, quando premi **Cerca aggiornamento** o, se lo lasci attivo, una volta al giorno all'apertura del menu.

## Cosa ti serve

- Brave o Chrome sul computer.
- Un account GitHub, solo per conservare il progetto.

L'installazione si fa una volta sola e richiede un paio di minuti.

## 1. Carica il progetto su GitHub

1. Crea un nuovo repository, per esempio `Keep_Watching`. Deve essere **pubblico** perché **Cerca aggiornamento** funzioni: GitHub risponde senza accesso solo per i repository pubblici. Se lo vuoi privato l'estensione funziona lo stesso, ma il controllo degli aggiornamenti dirà "Repository non trovato o privato".
2. Carica **il contenuto** della cartella `Keep_Watching_GitHub` nella radice del repository: `manifest.json`, `version.json`, `CHANGELOG.md`, `Keep_Watching-1.4.0.zip` e le cartelle devono stare al primo livello.

`version.json` e lo zip nella radice sono quello che legge **Cerca aggiornamento**. Se un giorno pubblichi le versioni come **release** di GitHub (con lo zip allegato), l'estensione usa quelle.

## 2. Installa l'estensione

### 2.1 Estrai lo zip

1. Scarica `Keep_Watching-1.4.0.zip` (dal repository, oppure dalla cartella del progetto).
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
| `storage` | Salvare le opzioni, le serie, il timer e le statistiche, e passare le informazioni da un episodio al successivo |
| `notifications` | Notifiche sul desktop |
| `declarativeNetRequest` | Bloccare il primo caricamento del player, che parte senza permesso di autoplay, così che l'estensione lo rifaccia con il permesso |
| Pagine `*/watch/*` e `*/iframe/*` | Dare al player il permesso di autoplay, schermo intero tra episodi, ricarica dello streaming bloccato |
| Player `vixcloud.co/embed/*` | Controllare il player |

La versione 1.4.0 non aggiunge permessi: il controllo degli aggiornamenti usa l'API pubblica di GitHub, che risponde a qualsiasi pagina, e l'esportazione delle statistiche usa il normale download del browser.

### 2.4 Scorciatoie

Apri `brave://extensions/shortcuts` (su Chrome `chrome://extensions/shortcuts`) e controlla le combinazioni di Keep_Watching:

| Comando | Di serie |
|---|---|
| Attiva o sospendi Keep_Watching | **Alt+Shift+K** |
| Salto avanti | **Alt+Shift+→** |
| Salta intro | **Alt+Shift+S** |
| Guida alle scorciatoie | **Alt+Shift+H** |
| Segna la fine dell'intro, Segna l'inizio dei titoli, Stop a fine episodio | nessuna: scegline una tu se ti servono |

Il browser non assegna una combinazione se è già usata da un'altra estensione: in quel caso scegline un'altra. Il menu, in **Riproduzione › Scorciatoie da tastiera**, mostra quali sono assegnate e segnala quelle mancanti o in conflitto con il browser. Sulle tastiere italiane **Shift** è il tasto **Maiusc**.

### 2.5 Verifica

1. Apri un episodio, apri gli strumenti per sviluppatori dal menu del browser (**Altri strumenti › Strumenti per sviluppatori**) e, nella scheda **Sources**, premi **Ctrl+F8**: senza questo passaggio il player si chiude con "Connessione negata da vixcloud.co" (vedi **Problemi comuni**).
2. Nella scheda **Console** scrivi `Keep_Watching` nel campo filtro e ricarica la pagina.
3. Deve comparire `[Keep_Watching] Player caricato con permesso: autoplay; fullscreen`. Se c'è, l'estensione è attiva sul player.

## 3. Aggiorna a una nuova versione

### 3.1 Dal menu

1. Apri il menu di Keep_Watching e vai in **Aggiornamenti**, poi premi **Cerca aggiornamento**.
2. Se c'è una versione nuova, leggi le novità e premi **Scarica aggiornamento**: il browser scarica lo zip dal repository ufficiale.
3. Estrai lo zip con **Estrai qui** nella **stessa cartella** in cui avevi estratto la versione attuale, sostituendo i file: la cartella `Keep_Watching` deve restare quella caricata in `brave://extensions`.
4. Torna nel menu e premi **Ho estratto lo zip: ricarica l'estensione**.
5. Riapri il menu: in **Panoramica** compare "Aggiornamento installato: ora hai la …" se la versione è cambiata davvero, altrimenti "La versione è ancora la …" con cosa controllare.

L'estensione non installa niente da sola e non esegue codice scaricato: il codice nuovo è solo quello che estrai tu nella cartella. Scaricare lo zip non vuol dire averlo installato, per questo il menu lo conferma solo dopo la ricarica.

Il controllo automatico (una volta al giorno, all'apertura del menu) si spegne in **Aggiornamenti › Preferenze**. Dopo un aggiornamento le novità compaiono una volta in **Panoramica**, mai sul video.

### 3.2 A mano

1. Estrai lo zip della nuova versione al posto della cartella `Keep_Watching` vecchia.
2. In `brave://extensions` premi l'icona di ricarica sulla scheda di Keep_Watching.
3. Ricarica la pagina dell'episodio.

Se la nuova versione chiede permessi nuovi (la 1.2.0, per esempio, ha aggiunto le notifiche), rimuovi l'estensione e caricala di nuovo dal passo 2.2. Le opzioni e le statistiche restano solo se ricarichi l'estensione; rimuovendola si perdono, comprese le serie salvate. Prima di rimuoverla puoi esportare le statistiche in JSON e reimportarle dopo.

## 4. La visione

1. Apri un episodio sul sito e premi play.
2. Lascia fare all'estensione: a fine episodio compare il conto alla rovescia e poi parte il prossimo.
3. La prima volta che guardi una serie, quando finisce l'intro muovi il mouse sul video e premi **Fine intro qui**. Verso la fine, quando iniziano i titoli, premi **Inizio titoli qui**. Da lì in poi, per quella serie, ci pensa l'estensione.
4. Se pensi di addormentarti, scegli il profilo **Notturno** e un **timer di spegnimento**, oppure premi **Stop a fine episodio** sul player.

### Il menu dell'estensione

Si apre cliccando l'icona di Keep_Watching. Le modifiche valgono subito, anche sull'episodio in corso. Il pulsante in basso a sinistra apre il menu in una scheda, più comoda per le statistiche e necessaria per importare un file.

| Sezione | Cosa contiene |
|---|---|
| **Panoramica** | Interruttore generale, cosa c'è sul player, profilo, timer, episodi di fila, avviso di aggiornamento, accesso rapido |
| **Riproduzione** | Cambio episodio, conto alla rovescia, limite di episodi, intro e titoli, serie salvate, salto avanti, timer, recupero dello streaming, scorciatoie |
| **Interfaccia sul video** | Popup sul video per categoria, aspetto della barra con anteprima, notifiche sul desktop |
| **Profili** | Normale, Notturno, Maratona, Manuale |
| **Statistiche** | Riepilogo, grafico giornaliero, esportazione e importazione, azzeramento |
| **Aggiornamenti** | Versione installata e ultima pubblicata, **Cerca aggiornamento**, novità, registro delle versioni |
| **Sostieni** | Il link per offrire un caffè su Ko-fi |

| Opzione | Cosa fa | Di serie |
|---|---|---|
| **Estensione attiva** | Interruttore generale (anche con Alt+Shift+K) | Attivo |
| **Prossimo episodio automatico** | Passa al successivo a fine episodio | Attivo |
| **Avvia il nuovo episodio** | Fa partire il nuovo episodio se si carica in pausa | Attivo |
| **Conto alla rovescia** | 5, 10, 15 o 20 secondi prima del cambio, oppure cambio immediato | 10 secondi |
| **Chiedi se continuare dopo** | 1, 2, 3, 5 o 10 episodi di fila | Mai |
| **Salta l'intro** | Salto automatico nelle serie in cui hai segnato la fine dell'intro | Attivo |
| **Salta i titoli di coda** | 15, 30, 60, 90 o 120 secondi prima della fine, oppure **Personalizzato…** con minuti e secondi | No |
| **Salto avanti** | Durata del pulsante e della scorciatoia: 15, 30, 45, 60 o 90 secondi | 60 secondi |
| **Timer di spegnimento** | Tra 15, 30, 45, 60 o 90 minuti, alla fine dell'episodio o della stagione | Disattivato |
| **Abbassa il volume prima** | Dissolvenza negli ultimi 30 secondi prima che il timer fermi il video | Attivo |
| **Resta a schermo intero** | Mantiene lo schermo intero tra un episodio e l'altro | Attivo |
| **Riparti se lo streaming si blocca** | Salto in avanti e poi ricarica dal punto in cui eri | Attivo |
| **Pausa quando cambi scheda** | Pausa quando la scheda viene nascosta, ripresa al ritorno | Disattivato |
| **Notifiche sul desktop** | Serie finita, limite di episodi, timer di spegnimento | Attivo |

Sotto **Serie salvate** c'è l'elenco delle serie, con la fine dell'intro e l'inizio dei titoli di ognuna, e **Rimuovi** per cancellarne una.

### Profili

| Profilo | Cosa imposta |
|---|---|
| **Normale** | Le impostazioni di serie: cambio automatico, conto alla rovescia di 10 secondi, tutti i messaggi sul video |
| **Notturno** | Meno messaggi sul video (niente conferme, avvisi di recupero e messaggi temporanei), volume abbassato prima dello stop, timer di spegnimento in primo piano nella Panoramica |
| **Maratona** | Conto alla rovescia di 5 secondi, schermo intero mantenuto, meno conferme e messaggi |
| **Manuale** | Nessun cambio episodio automatico: decidi tu quando andare avanti |

Il profilo cambia le impostazioni nel momento in cui lo scegli, poi le puoi modificare liberamente: il menu scrive **Personalizzato** e indica cosa hai cambiato, con **Ripristina il profilo** per tornare ai valori del profilo. I profili non avviano timer e non toccano il limite di episodi, l'aspetto della barra, le scorciatoie e le statistiche.

### Popup sul video

In **Interfaccia sul video › Popup sul video** scegli quali messaggi vedere sul player:

| Categoria | Se la nascondi |
|---|---|
| **Conto alla rovescia del prossimo episodio** | Il cambio avviene comunque, dopo lo stesso tempo |
| **Conferme di intro e titoli** | Intro saltata e segni salvati lo stesso, senza riquadro |
| **Domanda dopo N episodi di fila** | Al limite la visione si ferma (scelta sicura): per continuare premi "prossimo episodio" sul player |
| **Timer di spegnimento** | Il timer ferma il video comunque |
| **Streaming bloccato e ripresa** | Il recupero avviene comunque |
| **Altri messaggi temporanei** | Conferme delle scorciatoie e piccoli avvisi |

**Nascondi tutti i popup sul video** li toglie tutti insieme senza cancellare le scelte per categoria: spegnendolo tornano come prima. Nessuna categoria spegne la funzione corrispondente, e le notifiche sul desktop sono indipendenti. La guida alle scorciatoie compare sempre quando la chiedi tu.

### La barra sul player

Muovendo il mouse sul video compare in alto una barra di pulsanti. Sparisce dopo qualche secondo senza movimento (3 di serie) e resta finché il mouse è sopra.

| Pulsante | Quando compare | Cosa fa |
|---|---|---|
| **Salta intro** | Prima della fine dell'intro segnata | Salta alla fine dell'intro |
| **+60 s** | Sempre, tranne negli ultimi istanti dell'episodio | Avanti della durata scelta, anche più volte di seguito e con il video in pausa; non va oltre la fine |
| **Fine intro qui** | Nei primi 10 minuti | Segna la fine dell'intro per questa serie |
| **Inizio titoli qui** | Negli ultimi 10 minuti | Segna l'inizio dei titoli per questa serie; da quel punto parte il cambio episodio (con il conto alla rovescia, se attivo) |
| **Stop a fine episodio** | Sempre | Attiva o disattiva il timer "fine episodio" (con ✓ quando è attivo) |
| **?** | Sempre | Apre la guida alle scorciatoie |

In **Interfaccia sul video › Barra dei controlli** puoi cambiare dimensione (compatta, standard, grande), densità, opacità dello sfondo (il testo resta leggibile), posizione (in alto a sinistra, al centro, a destra), dopo quanto si nasconde (o mai), la **modalità minimale** con solo **Salta intro** e il salto avanti, e **Riduci le animazioni** (rispettata anche l'impostazione di sistema). L'anteprima mostra il risultato; **Ripristina aspetto** riporta solo questi valori a quelli di serie.

Dopo **Fine intro qui** e **Inizio titoli qui** compare per un attimo il valore salvato (per esempio "Intro fino a 1:32 ✓"). Se premi **Fine intro qui** nei primi 5 secondi, o **Inizio titoli qui** lasciando meno di un minuto di episodio, dice **Troppo presto** e non salva niente.

L'intro e i titoli si salvano per **titolo della serie**: valgono per tutti gli episodi e tutte le stagioni. I titoli si salvano come "secondi prima della fine", così funzionano anche con episodi di durata diversa.

### Guida alle scorciatoie

**Alt+Shift+H**, il pulsante **?** sulla barra o **Mostra la guida sul player** nel menu aprono sul player l'elenco delle scorciatoie: per ognuna la combinazione assegnata, se in questo momento si può usare (per esempio "Salta intro: nessuna intro segnata") e gli avvisi per quelle non assegnate o in conflitto. Si chiude con **Esc**, con **Chiudi** o, se lo imposti, da sola dopo 10 o 20 secondi. **Configura** apre la pagina delle scorciatoie del browser.

Le scorciatoie non fanno nulla mentre stai scrivendo in un campo di testo, così non disturbano la ricerca del sito.

### Conto alla rovescia e limite di episodi

- **Annulla** chiude il riquadro: l'episodio resta finito e non succede altro. Se torni indietro e lo riguardi fino alla fine, il conto alla rovescia ricompare.
- **Vai ora** passa subito al prossimo episodio.
- Con **Chiedi se continuare dopo**, raggiunto il numero di episodi di fila compare **Hai visto 3 episodi di fila** con **Basta così** e **Continua**. Entrambi azzerano il conteggio, come cambiare episodio a mano. Se la scheda è nascosta arriva anche una notifica.
- Il conteggio si azzera da solo dopo 3 ore senza cambi automatici, oppure con **Azzera** nel menu.

### Timer di spegnimento

- **Tra N minuti:** allo scadere il video va in pausa e compare **Riprendi**. Il menu mostra a che ora si ferma. Un timer scaduto mentre non stavi guardando viene ignorato.
- **Alla fine dell'episodio:** invece di cambiare episodio, il video si ferma. Il riquadro propone **Prossimo episodio** se vuoi continuare. Se hai segnato i titoli della serie, si ferma all'inizio dei titoli. Lo stesso timer si attiva dalla barra con **Stop a fine episodio**.
- **Alla fine della stagione:** gli episodi della stagione in corso continuano normalmente; quando parte il primo episodio della stagione dopo, il video viene fermato e compare **Guarda comunque**.
- **Volume:** con **Abbassa il volume prima** il volume scende piano negli ultimi 30 secondi e torna normale quando il video si ferma.
- Ogni timer si spegne da solo dopo essere scattato. "Fine episodio" e "fine stagione" scadono dopo 12 ore se non scattano.

### Statistiche

Le statistiche restano nel browser di questo computer: niente account, niente invii, nessun titolo nei file esportati. Si spengono con **Raccogli statistiche** (lo storico resta finché non lo azzeri).

| Dato | Come si misura |
|---|---|
| **Tempo di visione** | Solo il tempo in cui il video avanza davvero: pause, caricamenti, salti e scheda chiusa non contano. A velocità 2× conta il tempo reale, non quello del video. Quando il browser misura a intervalli lunghi (per esempio rallentando una scheda in background), il dato del giorno viene segnato come **stimato** |
| **Sessione** | Un periodo di visione; finisce dopo 30 minuti senza riproduzione |
| **Durata media** | Tempo di visione delle sessioni iniziate nel periodo diviso il loro numero |
| **Episodio completato** | Arrivato alla fine o ai titoli di coda dopo aver guardato davvero almeno metà di quello che restava dal punto in cui hai iniziato, e almeno un minuto. Saltare alla fine non conta; lo stesso episodio non conta due volte entro 6 ore |
| **Intro saltate** | Solo i salti automatici dell'estensione (annullati con **Annulla** non contano) |
| **Titoli saltati** | Cambi episodio fatti dall'estensione all'inizio dei titoli |

Il riepilogo è per **oggi**, **7 giorni** o **30 giorni**; il grafico mostra il tempo di visione giorno per giorno (con la tabella dei valori sotto), e lo storico si conserva per 400 giorni.

- **Esporta CSV:** una riga per giorno, colonne separate da `;` (si apre in Excel con le lettere accentate corrette): `data`, `tempo_visione_secondi`, `tempo_visione`, `sessioni`, `episodi_completati`, `intro_saltate`, `titoli_saltati`, `dato_stimato`.
- **Esporta JSON:** gli stessi dati più le sessioni, in un formato che si può reimportare.
- **Importa** (dal menu aperto in una scheda): **Unisci** tiene per ogni giorno il valore più alto, così reimportare lo stesso file non raddoppia nulla; **Sostituisci** cancella lo storico e lo rimpiazza, dopo una conferma. I file non validi vengono rifiutati senza toccare niente.
- **Azzera statistiche** chiede conferma e non tocca impostazioni, profili, timer e scorciatoie.

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

- **Serie finita** ("Brothers: episodi finiti"), **limite di episodi** e **fine stagione** con la scheda nascosta: arrivano se **Notifiche sul desktop** è attivo, anche con i popup sul video nascosti.
- **Pulsante non trovato** e **streaming bloccato**: arrivano sempre, perché segnalano un problema. "Pulsante non trovato" vuol dire che il player dice che c'è un episodio successivo ma il pulsante non si trova: quasi certamente il sito ha cambiato la barra dei controlli.
- Toccando una notifica si torna alla scheda dell'episodio.
- Il **badge** sull'icona mostra **OFF** quando l'estensione è sospesa e **2/3** quando sta contando gli episodi di fila.

## Pubblicare una nuova versione

1. Aumenta `"version"` in `manifest.json` (x.y.z: correzioni → z, funzioni nuove → y, cambiamenti incompatibili → x).
2. Aggiungi in cima a `CHANGELOG.md` una sezione `## [x.y.z] - AAAA-MM-GG`.
3. Esegui i test (`node tests/run.js` e, se puoi, `tests/e2e/run_all.sh`) e la checklist in `docs/MANUTENZIONE.md`.
4. Crea lo zip di installazione: su Windows `powershell -ExecutionPolicy Bypass -File tools/package.ps1`, su Linux, macOS o Git Bash `sh tools/package.sh`. Nella radice vengono creati `Keep_Watching-<versione>.zip` e `version.json`, lo zip della versione precedente viene eliminato e il nome dello zip in questo README viene aggiornato.
5. Carica tutto su GitHub, zip e `version.json` compresi: da quel momento **Cerca aggiornamento** propone la nuova versione.

La guida tecnica (come è fatto il sito, perché l'estensione funziona così, punti fragili, debug, statistiche, aggiornamenti, test) è in **[docs/MANUTENZIONE.md](docs/MANUTENZIONE.md)**.

## Problemi comuni

- **"Connessione negata da vixcloud.co" aprendo gli strumenti per sviluppatori:** il player ha una protezione contro gli strumenti per sviluppatori. Nella scheda **Sources** premi **Ctrl+F8** e ricarica la pagina. Anche F12 viene bloccato: apri gli strumenti dal menu del browser.
- **Il player mostra una pagina di errore o non si carica:** probabilmente il sito ha cambiato il percorso delle pagine (`/watch/`, `/iframe/`) e l'estensione non riesce più a dare il permesso al player. Sospendi l'estensione (Alt+Shift+K) per guardare e vedi `docs/MANUTENZIONE.md`.
- **A fine episodio non succede niente:** controlla che **Estensione attiva** e **Prossimo episodio automatico** siano accesi, che il profilo non sia **Manuale** e che l'icona non mostri **OFF**. Se arriva la notifica **pulsante non trovato**, il sito ha cambiato la barra del player.
- **Non vedo più il conto alla rovescia o altri messaggi sul video:** controlla **Interfaccia sul video › Popup sul video**: forse è acceso **Nascondi tutti i popup sul video** o la categoria è spenta. Le automazioni funzionano comunque.
- **Il nuovo episodio parte muto:** il browser ha rifiutato l'avvio con l'audio e l'estensione l'ha fatto partire senza. Succede se non hai mai cliccato sulla pagina: premi play a mano la prima volta.
- **Il video parte muto anche avviandolo a mano:** il player ricorda lo stato "muto". Riattiva l'audio una volta dal controllo del volume del player.
- **Il volume è rimasto basso dopo il timer di spegnimento:** la pagina è stata chiusa durante la dissolvenza e il player ha ricordato il volume. Rialzalo una volta dal player.
- **L'intro non viene saltata:** l'opzione **Salta l'intro** è spenta, l'intro di quella serie non è segnata (controlla l'elenco nel menu) oppure l'episodio è ripartito da un punto preciso, per esempio da "continua a guardare" del sito.
- **La barra di pulsanti non compare:** muovi il mouse sopra il video. **Fine intro qui** e **Inizio titoli qui** compaiono solo nei primi e negli ultimi 10 minuti, e mai in modalità minimale.
- **Sono rimasto bloccato a schermo intero:** premi **Esc**, oppure **F11**.
- **Una scorciatoia non fa niente:** apri la guida (Alt+Shift+H o **?** sulla barra) o il menu in **Riproduzione › Scorciatoie da tastiera**: se è segnata come non assegnata o in conflitto, sceglila in `brave://extensions/shortcuts`. Le scorciatoie non funzionano mentre scrivi in un campo di testo.
- **Cerca aggiornamento dice "Repository non trovato o privato":** il repository è privato o ha cambiato nome. Il controllo funziona solo con il repository pubblico `MashaUP/Keep_Watching`.
- **Cerca aggiornamento dice "limite di richieste":** GitHub accetta 60 richieste all'ora per rete senza accesso. Il menu indica da che ora riprovare.
- **Dopo l'aggiornamento il menu dice "La versione è ancora la …":** lo zip non è stato estratto nella cartella che il browser carica. Controlla in `brave://extensions` il percorso della cartella di Keep_Watching ed estrai lì, sostituendo i file.
- **Le statistiche sembrano basse:** contano solo il tempo in cui il video avanza davvero; pause, caricamenti e salti non contano. Controlla anche che **Raccogli statistiche** sia acceso.
- **Non riesco a importare le statistiche dal popup:** la scelta del file chiuderebbe il popup. Premi **Importa da una scheda**.
- **Non arrivano le notifiche:** controlla **Notifiche sul desktop** nel menu e, in Windows, **Impostazioni › Sistema › Notifiche** per Brave.
- **Nella console compare "A listener indicated an asynchronous response…":** non viene da Keep_Watching, i cui messaggi iniziano sempre con `[Keep_Watching]`. Viene da un'altra estensione installata.
- **Dopo l'aggiornamento l'estensione non cambia:** ricarica l'estensione in `brave://extensions` e poi la pagina dell'episodio. Se la nuova versione ha permessi nuovi, rimuovila e caricala di nuovo.

## Struttura dei file

```
Keep_Watching-1.4.0.zip      pacchetto da installare: la cartella Keep_Watching con i soli file dell'estensione
version.json                 ultima versione pubblicata, letta da "Cerca aggiornamento"
manifest.json                configurazione dell'estensione (Manifest V3)
rules.json                   regola di rete: blocca il primo caricamento del player senza permesso di autoplay
src/background.js            badge, scorciatoie, notifiche, schermo intero della finestra, statistiche, migrazione
src/defaults.js              opzioni di serie, validazione, profili, categorie di popup, scorciatoie, link
src/lib/stats.js             statistiche: misura, sessioni, riepiloghi, CSV e JSON, importazione
src/lib/updates.js           controllo degli aggiornamenti su GitHub e confronto delle versioni
src/player.js                player: cambio episodio, intro e titoli, timer, salto avanti, streaming bloccato, avvio
src/panel.js                 riquadro e avvisi sul player, tema e aspetto
src/toolbar.js               barra di pulsanti sul player
src/guide.js                 guida alle scorciatoie sul player
src/autoplay-permission.js   pagine del sito: permesso di autoplay al player
src/cinema.js                pagine del sito: player a tutta finestra tra un episodio e l'altro
src/recovery.js              pagine del sito: ricarica dell'episodio quando lo streaming si blocca
src/popup/                   menu dell'icona (HTML, CSS, JS)
icons/                       icone 16, 32, 48 e 128 px
tests/run.js                 test automatici delle librerie (Node.js, senza dipendenze)
tests/unit/                  test di impostazioni, statistiche e aggiornamenti
tests/e2e/                   test end-to-end su un sito di prova (Python, Playwright, Chromium)
tools/make_icons.py          rigenera le icone (serve Pillow)
tools/package.ps1            crea lo zip di installazione e version.json su Windows e aggiorna il README
tools/package.sh             lo stesso per Linux, macOS e Git Bash
docs/MANUTENZIONE.md         guida tecnica, debug, punti fragili, test e checklist
CHANGELOG.md                 novità di ogni versione
```

L'estensione non usa librerie esterne. L'unica richiesta di rete propria è il controllo degli aggiornamenti verso `api.github.com`, senza cookie e senza dati personali.

## Donazioni

Keep_Watching è gratis e senza funzioni a pagamento. Se ti è utile, puoi offrire un caffè su Ko-fi: https://ko-fi.com/mashaup (anche dalla sezione **Sostieni** del menu).

## Crediti e licenze

- Codice: licenza MIT (file `LICENSE`).
- Icona disegnata da `tools/make_icons.py`, nel verde del player del sito.
- Icone del menu disegnate a mano in SVG nel file del menu.
- Progetto personale, non affiliato a StreamingCommunity né a JW Player. L'estensione automatizza i controlli del player senza modificare i contenuti del sito.
