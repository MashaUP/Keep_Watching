# Changelog

Tutte le modifiche rilevanti del progetto sono elencate qui.
Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e le versioni seguono il [Semantic Versioning](https://semver.org/lang/it/).

## [1.0.0] - 2026-09-30

Prima versione pubblicata.

### Aggiunto
- Passaggio automatico all'episodio successivo a fine episodio, con click sul pulsante "prossimo episodio" del player.
- Avvio automatico con audio del nuovo episodio, anche dopo un click manuale su "prossimo episodio".
- Permesso di autoplay per l'iframe del player (`allow="autoplay"`), senza il quale il browser bloccava l'audio.
- Menu dall'icona con le opzioni: prossimo episodio automatico, avvio del nuovo episodio, salta i titoli di coda (da 15 secondi a 2 minuti prima della fine), fermati dopo N episodi di fila.
- Funzionamento indipendente dal dominio principale del sito, che cambia periodicamente.
- Icone e script di utilità in `tools/` (rigenerazione icone, creazione del pacchetto zip).
