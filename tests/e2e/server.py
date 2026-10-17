"""
Sito di prova con la stessa struttura di StreamingCommunity (vedi docs/MANUTENZIONE.md):

  /it/watch/<id>                pagina principale (non si ricarica tra gli episodi)
   └─ /it/iframe/<id>?episode_id=N[&minute=M]   iframe intermedio, contiene il player
       └─ http://vixcloud.co:<porta>/embed/N?t=…&d=…[&nextEpisode=1][&minute=M]

vixcloud.co viene reindirizzato a 127.0.0.1 con --host-resolver-rules. Il player finto ha
le stesse classi di JW Player che l'estensione usa (.jwplayer, .jw-controlbar,
.next-episode, .jw-icon-fullscreen). Configurazione a caldo: GET /__config?chiave=valore
  last=3        numero di episodi (gli episodi 1-2 sono S1, dal 3 S2)
  stall=1       il video del prossimo player si blocca dopo pochi secondi
  title=…       titolo della serie
  broken=1      il player dice che c'è un episodio successivo ma il pulsante manca
  clip=long     video di 12 minuti invece di 90 secondi
I video si creano con make_clips.sh (serve ffmpeg).
"""
import base64, http.server, os, socketserver, sys, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
CLIPS = {'short': os.path.join(HERE, 'clip-90s.webm'), 'long': os.path.join(HERE, 'clip-12min.webm')}
PORT = int(os.environ.get('KW_PORT', '8000'))
CONFIG = {'last': '3', 'stall': '0', 'title': 'Brothers', 'broken': '0', 'clip': 'short'}
b64 = lambda s: base64.b64encode(s.encode()).decode()


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_html(self, html):
        body = html.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_video(self, stall):
        data = open(CLIPS.get(CONFIG['clip'], CLIPS['short']), 'rb').read()
        size = len(data)
        rng = self.headers.get('Range')
        if stall:
            # Manda una parte del file e poi si ferma: il video resta "in caricamento".
            self.send_response(200)
            self.send_header('Content-Type', 'video/webm')
            self.send_header('Content-Length', str(size))
            self.end_headers()
            try:
                self.wfile.write(data[:150000]); self.wfile.flush(); time.sleep(120)
            except Exception:
                pass
            return
        if rng:
            a, b = rng.replace('bytes=', '').split('-')
            a = int(a); b = int(b) if b else size - 1
            self.send_response(206)
            self.send_header('Content-Range', f'bytes {a}-{b}/{size}')
        else:
            a, b = 0, size - 1
            self.send_response(200)
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Type', 'video/webm')
        self.send_header('Content-Length', str(b - a + 1))
        self.end_headers()
        try:
            self.wfile.write(data[a:b + 1])
        except Exception:
            pass

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        if u.path == '/__config':
            for k, v in q.items():
                CONFIG[k] = v[0]
            return self.send_html('ok')
        if u.path in ('/clip.webm', '/stall.webm'):
            return self.send_video(u.path == '/stall.webm')
        if u.path.startswith('/it/watch/'):
            return self.send_html("""<!doctype html><html><body style="margin:0;background:#333">
<input id="search" placeholder="Cerca" style="position:absolute;top:4px;left:4px">
<iframe id="mid" src="/it/iframe/1?episode_id=1" allow="autoplay; fullscreen" style="margin-top:40px;width:640px;height:360px;border:0"></iframe>
<script>addEventListener('message', e => { if (e.data && e.data.type==='next') { document.getElementById('mid').src='/it/iframe/1?episode_id='+e.data.ep; history.pushState({},'', '/it/watch/1?e='+e.data.ep); } });</script>
</body></html>""")
        if u.path.startswith('/it/iframe/'):
            ep = int(q['episode_id'][0])
            minute = q.get('minute', [''])[0]
            last = int(CONFIG['last'])
            nxt = '&nextEpisode=1' if (ep < last or CONFIG['broken'] == '1') else ''
            season = 1 if ep < 3 else 2
            mparam = f'&minute={minute}' if minute else ''
            stall = '&stall=1' if CONFIG['stall'] == '1' and not minute else ''
            src = (f"http://vixcloud.co:{PORT}/embed/{ep}?token=abc&t={urllib.parse.quote(b64(CONFIG['title']))}"
                   f"&d={urllib.parse.quote(b64(f'S{season}:E{ep} Episodio {ep}'))}{nxt}{mparam}{stall}")
            return self.send_html(f'<!doctype html><html><body style="margin:0"><iframe ref="iframe" src="{src}" frameborder="0" height="100%" width="100%" style="position:absolute;inset:0"></iframe></body></html>')
        if u.path.startswith('/embed/'):
            ep = int(u.path.split('/')[2])
            minute = int(q.get('minute', ['0'])[0] or 0)
            src = '/stall.webm' if q.get('stall') else '/clip.webm'
            show_next = ep < int(CONFIG['last']) and CONFIG['broken'] != '1'
            nextbtn = (f'<div class="jw-icon jw-icon-inline next-episode" role="button" '
                       f'onclick="top.postMessage({{type:\'next\',ep:{ep + 1}}},\'*\')">NEXT</div>') if show_next else ''
            return self.send_html(f"""<!doctype html><html><body style="margin:0;background:#000">
<div class="jwplayer" style="position:relative;width:100%;height:100vh">
<video src="{src}" style="width:100%;height:100%"></video>
<div class="jw-controlbar" style="position:absolute;bottom:0;left:0;right:0;height:40px;background:#222;color:#fff;display:flex;gap:10px">
<div class="jw-icon jw-icon-playback" role="button" onclick="document.querySelector('video').play()">PLAY</div>{nextbtn}
<div class="jw-icon jw-icon-fullscreen" role="button" onclick="document.querySelector('.jwplayer').requestFullscreen()">FS</div></div></div>
<script>const v=document.querySelector('video'); v.addEventListener('loadedmetadata',()=>{{ if({minute}) v.currentTime={minute}*60; }}, {{once:true}}); if({minute}) v.autoplay=true;</script>
</body></html>""")
        self.send_response(404)
        self.end_headers()


if __name__ == '__main__':
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Handler) as srv:
        print(f'Sito di prova su http://127.0.0.1:{PORT}/it/watch/1', flush=True)
        srv.serve_forever()
