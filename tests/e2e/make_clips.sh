#!/usr/bin/env sh
# Crea i due video del sito di prova (serve ffmpeg). Non vanno caricati su GitHub.
set -e
cd "$(dirname "$0")"
[ -f clip-90s.webm ] || ffmpeg -loglevel error -y -f lavfi -i testsrc=duration=90:size=160x90:rate=10 \
  -f lavfi -i sine=frequency=440:duration=90 -shortest -c:v libvpx -b:v 60k -c:a libopus -b:a 24k clip-90s.webm
[ -f clip-12min.webm ] || ffmpeg -loglevel error -y -f lavfi -i testsrc=duration=720:size=96x54:rate=5 \
  -f lavfi -i sine=frequency=330:duration=720 -shortest -c:v libvpx -b:v 20k -c:a libopus -b:a 12k clip-12min.webm
ls -la clip-*.webm
