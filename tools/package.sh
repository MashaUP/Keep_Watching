#!/usr/bin/env sh
# Crea Keep_Watching-<versione>.zip nella radice del repository e aggiorna il nome
# dello zip nel README. Lo zip contiene la cartella Keep_Watching/ con i soli file
# dell'estensione: estraendolo si ottiene la cartella da caricare nel browser.
# Rimuove gli zip di versioni precedenti.
# Uso (Linux, macOS, Git Bash su Windows):  sh tools/package.sh
set -e
cd "$(dirname "$0")/.."
REPO=$(pwd)
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json | head -n 1)
OUT="Keep_Watching-$VERSION.zip"

STAGE=$(mktemp -d)
mkdir "$STAGE/Keep_Watching"
cp -R manifest.json rules.json src icons "$STAGE/Keep_Watching/"

rm -f Keep_Watching-*.zip
(cd "$STAGE" && zip -rq "$REPO/$OUT" Keep_Watching)
rm -rf "$STAGE"

sed -i.bak -E "s/Keep_Watching-[0-9]+\.[0-9]+\.[0-9]+\.zip/$OUT/g" README.md && rm -f README.md.bak
echo "Creato $OUT (README aggiornato)"
