# Keep Watching — rilascio

Regole comuni: `claude/standard-comuni.md` del progetto «Progetti Github». Qui i passi per questo repository.

## Versione

- Fonte unica: `"version"` in `manifest.json`. Le copie (`package.json`, `package-lock.json`, `version.json`) le controlla `npm run check`: se non coincidono la release si ferma.
- Semver: **PATCH** (1.6.**1**) correzioni e ritocchi, per esempio un selettore o un dominio del player; **MINOR** (1.**7**.0) funzioni nuove compatibili; **MAJOR** (**2**.0.0) cambiamenti incompatibili o dati da convertire.
- Ogni cambiamento ai file distribuiti (codice, zip) è una versione nuova. Modifiche solo al repository (CI, documenti) possono restare sulla stessa versione, dichiarandolo.

## Passi

1. Aumenta `version` in `manifest.json` e `package.json`, poi `npm install --package-lock-only` (allinea `package-lock.json`).
2. Aggiungi in cima a `CHANGELOG.md` la sezione `## [x.y.z] - AAAA-MM-GG` con una riga sul perché di quel tipo di versione e le voci `### Aggiunto`, `### Corretto`, `### Modificato` (per i bug: sintomo, causa, correzione). Le voci `- …` (tranne quelle di `### Repository`, per CI e documenti) diventano le novità di `version.json` (al massimo 12) e il menu le mostra dopo l'aggiornamento.
3. `npm run package`: crea `dist/Keep_Watching-x.y.z.zip` e il suo `.sha256`, sostituisce lo zip nella radice, scrive `version.json` (versione, data, zip, SHA-256, novità), aggiorna il nome dello zip nel README e crea `dist/Keep_Watching_GitHub.zip`. Serve il comando `zip`: su Windows usa WSL o Git Bash con zip, oppure scarica lo zip dall'esecuzione della CI.
4. `npm test` e `npm run test:e2e`, poi la [prova a mano](TEST_PLAN.md#prova-a-mano-sul-sito-reale) per le parti toccate.
5. Carica su GitHub il contenuto di `Keep_Watching_GitHub/` nella radice del repository e **cancella a mano lo zip della versione precedente** (caricando la cartella GitHub non lo toglie). Da questo momento «Cerca aggiornamento» propone la nuova versione: legge `version.json` da `main`.
6. Pubblica la release `vx.y.z` su GitHub (tag uguale alla versione, titolo e testo brevi). `release.yml` ripete i test, allega `Keep_Watching-x.y.z.zip` e `.sha256` e annuncia la release su Discord.

Lo zip è riproducibile (date, ordine e permessi fissi): quello ricreato da `release.yml` ha lo stesso SHA-256 di quello nella radice. Se non coincide, il workflow lo segnala con un avviso.

## Workflow

| File | Quando | Cosa fa |
|---|---|---|
| `.github/workflows/ci.yml` | Push su `main`, pull request, a mano | `npm ci`, `npm test`, `npm run build`, zip scaricabile dall'esecuzione per 14 giorni |
| `.github/workflows/release.yml` | Release pubblicata, oppure a mano con `tag`, `salta_test`, `annuncia_discord` | Si ferma se il tag non è `vx.y.z` o non è la versione del manifest; `npm test` con `STRICT=1` (lo zip della versione deve essere nella radice); `npm run build`; `gh release upload --clobber` di zip e `.sha256` (rilanciando si sostituiscono); annuncio su Discord |

Rilanciare a mano: **Actions › Release › Run workflow**, con il tag. L'annuncio su Discord parte da solo alla pubblicazione; rilanciando, solo con «Annuncia la release anche su Discord».

## Segreti

| Segreto | Obbligatorio | Uso |
|---|---|---|
| `GITHUB_TOKEN` | automatico | Allegare i file alla release |
| `DISCORD_WEBHOOK_URL` | consigliato | Annuncio della release su Discord (titolo, testo, link allo zip, nessuna menzione). Senza: avviso e fine. Un URL che non è un webhook di Discord o una risposta diversa da 200/204: errore (lo zip è già allegato) |

Si impostano in **Settings › Secrets and variables › Actions**. Mai nel repository: `npm run check` blocca URL di webhook e token.

## Cambiare un collegamento

I collegamenti del menu hanno valori di serie in `src/lib/links.js` (`DEFAULTS`) e una copia in `links.json` nella radice, che il menu rilegge da `raw.githubusercontent.com/MashaUP/Keep_Watching/main/links.json` al massimo ogni 12 ore e a ogni **Cerca aggiornamento**.

**Senza versione nuova** (per esempio un nuovo invito Discord):

1. Su GitHub modifica `links.json` su `main`, per esempio `"discord": { "url": "https://discord.gg/NUOVO", "enabled": true, "label": "Discord" }`.
2. Aumenta `revision` di 1 e salva.
3. Entro 12 ore le estensioni installate usano il nuovo indirizzo; per vederlo subito premi **Cerca aggiornamento**.

Formato (standard comune, sezione 1):

```json
{
  "schemaVersion": 1,
  "project": "keep-watching",
  "revision": 1,
  "links": {
    "discord": { "url": "https://discord.gg/EPsbQCuAkx", "enabled": true, "label": "Discord" }
  }
}
```

- Chiavi: `github`, `discord`, `kofi`, `documentation`, `changelog`, `bugs`, `ideas`; solo lettere minuscole. Una chiave nuova con `label` e `url` aggiunge un collegamento (icona generica, se `icon` non è tra quelle del menu).
- Campi: `url`, `enabled`, `label`; facoltativi `description`, `icon`, `order`. Gli altri si ignorano.
- Solo `https`. Host: `github.com`, `discord.gg`, `discord.com`, `ko-fi.com`, `mashaup.github.io`; `github`, `discord` e `kofi` accettano solo il proprio.
- Ogni voce si valida da sola: una voce non valida resta al valore di serie. `enabled: false` nasconde il collegamento.
- Rete assente, tempo scaduto (5 s), limite di GitHub o file non valido: si continua con l'ultima configurazione valida, altrimenti con i valori di serie. File assente: valori di serie.

**In modo permanente** (o con un host nuovo): cambia `DEFAULTS` (e, se serve, `ALLOWED_HOSTS`) in `src/lib/links.js` e `links.json`, poi `npm test` (controlla che coincidano) e pubblica una versione nuova.

`bugs` e `ideas` aprono i modelli `.github/ISSUE_TEMPLATE/bug.yml` e `idea.yml`: funzionano solo con le Issues attive nel repository (**Settings › General › Features › Issues**). Se le spegni, metti `"enabled": false` alle due voci in `links.json`.

## Se il player cambia dominio

Procedura in [SITE_NOTES.md](SITE_NOTES.md#se-il-player-cambia-dominio): tre elenchi da aggiornare (`src/hosts.js`, `manifest.json`, `rules.json`), che `npm run check` confronta. È una versione PATCH.
