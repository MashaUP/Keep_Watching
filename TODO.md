# Da fare

Proposte non ancora approvate. Nessuna è implementata.

## Allineamento agli standard comuni (emerse con la 1.6.1)

| Proposta | Perché | Nota |
|---|---|---|
| Verificare lo SHA-256 dello zip prima di salvarlo (standard, sezione 3, punto 4) | Oggi «Scarica aggiornamento» apre l'indirizzo nel browser senza controllo | Serve il permesso `downloads` (permesso nuovo) |
| Pulsante «Copia il report» con versione, browser, stato dei componenti e ultimi errori (G7, standard sezione 8) | Oggi c'è l'esportazione JSON della cronologia, non un report copiabile | Va escluso il nome della serie |
| Rilevare gli script vecchi dopo un aggiornamento e dire «ricarica la pagina» (C1) | Dopo la ricarica dell'estensione le pagine aperte perdono il collegamento senza avviso | |
| Dire se la cartella è già aggiornata ma non ricaricata (`diskVersion`, standard sezione 3, punto 6) | Oggi lo si capisce solo dopo la ricarica | |

## Dalle versioni precedenti

| Priorità | Proposta | Perché | Rischio |
|---|---|---|---|
| Alta | Prova sul sito reale delle novità 1.5.0 (checklist in docs/TEST_PLAN.md) | Tutto il recupero è stato provato solo sul sito di prova | — |
| Alta | Selettori alternativi per "prossimo episodio" scelti dopo averli visti sul sito reale | Oggi c'è un solo selettore | Un selettore sbagliato cliccherebbe il pulsante sbagliato: va scelto guardando il sito, non inventato |
| Media | Serie identificate dall'id della pagina `/watch/<id>` oltre al titolo | Evita che due serie omonime condividano intro e titoli | Migrazione dei dati salvati |
| Media | Esportazione unica "pacchetto diagnostico" (cronologia + ultima Verifica tutto) | Più semplice da allegare a una segnalazione | — |
| Bassa | Statistiche per mese | I dati giornalieri già lo permettono | — |
| Bassa | Prova su Edge | Stesso motore, ma non verificato | — |
