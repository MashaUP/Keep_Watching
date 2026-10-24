#!/usr/bin/env bash
# Esegue tutti i test end-to-end sul sito di prova. Serve: python3, playwright, Chromium,
# ffmpeg (per creare i video la prima volta) e, senza schermo, xvfb-run.
set -u
cd "$(dirname "$0")"
[ -f clip-90s.webm ] && [ -f clip-12min.webm ] || ./make_clips.sh
python3 server.py > /tmp/kw-server.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1
RUN=python3
command -v xvfb-run > /dev/null && [ -z "${DISPLAY:-}" ] && RUN="xvfb-run -a python3"
failed=0
for t in test_regression test_quick_skip test_popups test_stats test_guide_ui test_popup test_health test_links; do
  echo "== $t"
  if $RUN "$t.py" > "/tmp/kw-$t.log" 2>&1; then
    echo "   superato ($(grep -c '✓' "/tmp/kw-$t.log") controlli)"
  else
    echo "   FALLITO: vedi /tmp/kw-$t.log"; tail -5 "/tmp/kw-$t.log"; failed=$((failed + 1))
  fi
done
echo "Test end-to-end falliti: $failed"
exit $failed
