#!/usr/bin/env sh
# Crea Keep_Watching-<versione>.zip nella radice del repository, con i soli file
# dell'estensione (manifest.json nella radice dello zip). Rimuove gli zip di versioni precedenti.
# Uso (Linux, macOS, Git Bash su Windows):  sh tools/package.sh
set -e
cd "$(dirname "$0")/.."
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json | head -n 1)
OUT="Keep_Watching-$VERSION.zip"
rm -f Keep_Watching-*.zip
zip -rq "$OUT" manifest.json rules.json src icons
echo "Creato $OUT"
