# Sicurezza e riservatezza

## Cosa tratta Keep Watching e dove resta

Tutto resta nello spazio del browser, sul tuo computer (`chrome.storage.local` e, per lo stato delle schede aperte, `chrome.storage.session`). Nessun server, nessun account, nessuna telemetria.

| Dato | Contenuto | Dove |
|---|---|---|
| Impostazioni e profili | Le tue scelte nel menu | `chrome.storage.local` |
| Serie salvate | Titolo della serie, fine dell'intro e inizio dei titoli che hai segnato | `chrome.storage.local` |
| Timer, conteggio di episodi di fila, punto di ripresa | Dati di pochi minuti o ore, poi scadono | `chrome.storage.local` |
| Statistiche | Tempo di visione, sessioni ed episodi completati per giorno (400 giorni). Nessun titolo nei file esportati | `chrome.storage.local` |
| Cronologia eventi | Ultimi 300 eventi diagnostici. Degli indirizzi restano solo host e percorso, mai token o parametri | `chrome.storage.local` |
| Stato delle schede | Stato del player della scheda aperta | `chrome.storage.session` (sparisce chiudendo il browser) |

## Richieste verso l'esterno

L'estensione fa richieste proprie solo dal menu, verso GitHub, senza cookie (`credentials: "omit"`) e senza parametri:

- `raw.githubusercontent.com/MashaUP/Keep_Watching/main/version.json` e `CHANGELOG.md`, quando premi **Cerca aggiornamento** o, se lo lasci attivo, una volta al giorno all'apertura del menu;
- `raw.githubusercontent.com/MashaUP/Keep_Watching/main/links.json`, al massimo ogni 12 ore e con **Cerca aggiornamento**;
- lo zip della nuova versione, solo quando premi **Scarica aggiornamento** (lo scarica il browser in una scheda).

Sul sito l'estensione non invia nulla: legge la pagina e il player e preme i loro pulsanti come faresti tu.

## Cosa non fa mai

- Non esegue codice scaricato: niente `eval`, niente script remoti. L'aggiornamento è lo zip che estrai tu nella cartella.
- Non invia statistiche, cronologia o impostazioni a nessuno.
- Non legge cookie, password o dati di altri siti. Agisce solo sulle pagine `/watch/` e `/iframe/` del sito e sul player di vixcloud.
- Non inserisce nella pagina testi presi dai dati: i testi dinamici passano da `textContent`; `innerHTML` solo con modelli fissi (lo controlla `npm run check`).
- `links.json` è solo dati: ogni indirizzo deve essere `https` su un host consentito per quel collegamento (GitHub solo su github.com, Discord solo su discord.gg o discord.com, Ko-fi solo su ko-fi.com, documentazione su mashaup.github.io); il resto viene scartato.
- Le operazioni che cancellano dati (azzerare le statistiche, importarle, cancellare la cronologia) sono accettate solo dalle pagine dell'estensione, non dagli script nelle pagine del sito.

## Permessi

| Permesso | Perché |
|---|---|
| `storage` | Impostazioni, serie, timer, statistiche, cronologia |
| `notifications` | Notifiche sul desktop |
| `declarativeNetRequest` | Bloccare il primo caricamento del player senza permesso di autoplay, così che l'estensione lo rifaccia con il permesso |
| Pagine `*/watch/*` e `*/iframe/*` | Il sito cambia dominio: l'estensione si aggancia al percorso. Per questo il browser avvisa che può «leggere e modificare i dati su tutti i siti» |
| Player `vixcloud.co/embed/*` e `vixcloud.cc/embed/*` | Controllare il player |

Un permesso nuovo viene sempre spiegato nel CHANGELOG; `npm run check` blocca il rilascio se l'elenco cambia senza che sia aggiornato anche il controllo.

## Il file della cronologia

**Cronologia › Esporta JSON** contiene solo gli eventi: niente cookie, token o indirizzi completi. Può contenere il nome della serie e dell'episodio, se compaiono nei messaggi: controllalo prima di condividerlo.

## Segnalare un problema

Apri una segnalazione su https://github.com/MashaUP/Keep_Watching/issues oppure scrivi sul Discord del progetto (https://discord.gg/EPsbQCuAkx). Per un problema di sicurezza non pubblicare i dettagli: chiedi prima un contatto privato su Discord.
