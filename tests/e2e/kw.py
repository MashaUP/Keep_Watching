"""
Strumenti per i test end-to-end: avvia Chromium con l'estensione caricata sul sito di
prova (server.py) e offre scorciatoie per leggere player, barra, riquadri e storage.

I riquadri dell'estensione usano Shadow DOM chiusi: per poterli leggere, i test caricano
una copia dell'estensione in cui l'unica differenza è mode: 'open'.
"""
import asyncio, json, os, re, shutil, tempfile, time
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = int(os.environ.get('KW_PORT', '8000'))
BASE = f'http://127.0.0.1:{PORT}'


def test_copy():
    """Copia dell'estensione con gli Shadow DOM aperti."""
    dst = tempfile.mkdtemp(prefix='kw_ext_')
    for item in ('manifest.json', 'rules.json', 'src', 'icons', 'CHANGELOG.md'):
        src = os.path.join(ROOT, item)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(dst, item))
        elif os.path.exists(src):
            shutil.copy(src, dst)
    for dirpath, _, files in os.walk(os.path.join(dst, 'src')):
        for f in files:
            if f.endswith('.js'):
                p = os.path.join(dirpath, f)
                s = open(p, encoding='utf-8').read()
                if "mode: 'closed'" in s:
                    open(p, 'w', encoding='utf-8').write(s.replace("mode: 'closed'", "mode: 'open'"))
    return dst


async def config(page, **kw):
    q = '&'.join(f'{k}={v}' for k, v in kw.items())
    await page.request.get(f'{BASE}/__config?{q}')


class KW:
    def __init__(self, viewport=True, quiet=False):
        self.viewport = viewport
        self.quiet = quiet
        self.logs = []

    async def __aenter__(self):
        self.ext = test_copy()
        self.profile = tempfile.mkdtemp(prefix='kw_prof_')
        self.p = await async_playwright().start()
        opts = dict(headless=False, args=[
            f'--disable-extensions-except={self.ext}', f'--load-extension={self.ext}',
            '--host-resolver-rules=MAP vixcloud.co 127.0.0.1', '--no-first-run'])
        if not self.viewport:
            opts['no_viewport'] = True
        self.ctx = await self.p.chromium.launch_persistent_context(self.profile, **opts)
        self.sw = self.ctx.service_workers[0] if self.ctx.service_workers else await self.ctx.wait_for_event('serviceworker')
        self.ext_id = self.sw.url.split('/')[2]
        # Appena avviato, il service worker può non avere ancora le API chrome.*: si aspetta.
        for _ in range(50):
            if await self.sw.evaluate("typeof chrome !== 'undefined' && !!chrome.notifications && !!chrome.storage"):
                break
            await asyncio.sleep(0.1)
        await self.sw.evaluate("""(() => { const orig = chrome.notifications.create; self.__notes = [];
            chrome.notifications.create = (o) => { self.__notes.push(o.title + ' | ' + o.message); return orig(o); }; })()""")
        # GitHub finto: il sandbox non raggiunge api.github.com e i test devono essere ripetibili.
        self.github = {}
        await self.ctx.route('https://api.github.com/**', self._github)
        self.page = await self.ctx.new_page()
        self.t0 = time.time()
        self.page.on('console', self._console)
        self.page.on('pageerror', lambda e: self._log(f'PAGEERROR {e}'))
        await config(self.page, last=3, stall=0, title='Brothers', broken=0)
        return self

    async def _github(self, route):
        url = route.request.url
        self.github_calls = getattr(self, 'github_calls', []) + [url]
        # Intestazioni CORS come quelle vere di api.github.com (i limiti di richieste sono leggibili).
        cors = {'access-control-allow-origin': '*',
                'access-control-expose-headers': 'ETag, Link, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Used'}
        for pattern, resp in self.github.items():
            if pattern in url:
                if resp == 'abort':
                    return await route.abort('internetdisconnected')
                status, body, headers = resp if len(resp) == 3 else (*resp, {})
                return await route.fulfill(status=status, body=body if isinstance(body, str) else json.dumps(body),
                                           headers={'content-type': 'application/json', **cors, **headers})
        await route.fulfill(status=404, body='{"message":"Not Found"}', headers={'content-type': 'application/json', **cors})

    def _log(self, text):
        line = f'  [{time.time() - self.t0:5.1f}] {text}'
        self.logs.append(text)
        if not self.quiet:
            print(line, flush=True)

    def _console(self, m):
        if 'Keep_Watching' in m.text or 'rror' in m.text:
            self._log(m.text)

    async def __aexit__(self, *a):
        await self.ctx.close()
        await self.p.stop()
        shutil.rmtree(self.ext, ignore_errors=True)
        shutil.rmtree(self.profile, ignore_errors=True)

    # ---- storage e service worker
    async def set(self, obj):
        await self.sw.evaluate('o => chrome.storage.local.set(o)', obj)

    async def get(self, keys):
        return await self.sw.evaluate('k => chrome.storage.local.get(k)', keys)

    async def notes(self):
        return await self.sw.evaluate('self.__notes')

    async def command(self, name):
        """Come premere la scorciatoia: stessa funzione usata da chrome.commands.onCommand."""
        return await self.sw.evaluate(f"handleCommand('{name}')")

    # ---- player
    def player(self):
        frames = [f for f in self.page.frames if 'vixcloud' in f.url]
        return frames[-1] if frames else None

    async def wait_player(self, timeout=10):
        for _ in range(timeout * 10):
            f = self.player()
            if f:
                try:
                    if await f.evaluate("!!document.querySelector('video') && !!document.querySelector('video').currentSrc"):
                        return f
                except Exception:
                    pass
            await asyncio.sleep(0.1)
        raise RuntimeError('player non trovato')

    async def open(self, play=True):
        await self.page.goto(f'{BASE}/it/watch/1')
        await self.wait_player()
        await asyncio.sleep(0.5)
        if play:
            await self.player().click('text=PLAY')

    async def video(self):
        return await self.player().evaluate("""(()=>{const v=document.querySelector('video');
            return {t:+v.currentTime.toFixed(1),paused:v.paused,vol:+v.volume.toFixed(2),dur:+v.duration.toFixed(1),ep:location.pathname.split('/')[2]}})()""")

    async def seek(self, t):
        await self.player().evaluate(f"document.querySelector('video').currentTime={t}")

    async def _host(self, name):
        return f"document.querySelector('[data-kw=\"{name}\"]')"

    async def toolbar(self, hover=True):
        f = self.player()
        if hover:
            box = await f.frame_element()
            b = await box.bounding_box()
            await self.page.mouse.move(b['x'] + 200, b['y'] + 150)
            await self.page.mouse.move(b['x'] + 210, b['y'] + 160)
            await asyncio.sleep(0.2)
        return await f.evaluate("""(()=>{const h=document.querySelector('[data-kw="toolbar"]'); if(!h||h.style.display==='none') return null;
            return [...h.shadowRoot.querySelectorAll('button')].map(b=>b.textContent)})()""")

    async def click_toolbar(self, label, hover=True):
        await self.toolbar(hover)
        ok = await self.player().evaluate("""l=>{const h=document.querySelector('[data-kw="toolbar"]');
            const b=[...h.shadowRoot.querySelectorAll('button')].find(b=>b.textContent.startsWith(l)); if(!b) return false; b.click(); return true;}""", label)
        if not ok:
            raise AssertionError(f'pulsante "{label}" non trovato sulla barra')

    async def toolbar_style(self):
        return await self.player().evaluate("""(()=>{const h=document.querySelector('[data-kw="toolbar"]'); if(!h) return null;
            const bar=h.shadowRoot.querySelector('.bar'); const cs=getComputedStyle(bar); const r=h.getBoundingClientRect();
            const btn=h.shadowRoot.querySelector('button'); const bcs=btn?getComputedStyle(btn):null;
            return {bg:cs.backgroundColor, gap:cs.gap, align:h.dataset.align, left:Math.round(r.left), right:Math.round(innerWidth-r.right), top:Math.round(r.top),
              font:bcs&&bcs.fontSize, color:bcs&&bcs.color, reduce:h.hasAttribute('data-reduce-motion')}})()""")

    async def panel(self):
        return await self.player().evaluate("""(()=>{const h=document.querySelector('[data-kw="panel"]'); if(!h) return null;
            const r=h.shadowRoot; return r.querySelector('.title').textContent+' | '+r.querySelector('.text').textContent+' | '+[...r.querySelectorAll('button')].map(b=>b.textContent).join('/')})()""")

    async def click_panel(self, label):
        await self.player().evaluate("""l=>{const h=document.querySelector('[data-kw="panel"]');
            [...h.shadowRoot.querySelectorAll('button')].find(b=>b.textContent===l).click()}""", label)

    async def toast(self):
        return await self.player().evaluate("""(()=>{const h=document.querySelector('[data-kw="toast"]'); return h ? h.shadowRoot.querySelector('.msg').textContent : null})()""")

    async def guide(self):
        return await self.player().evaluate("""(()=>{const h=document.querySelector('[data-kw="guide"]'); if(!h) return null;
            return [...h.shadowRoot.querySelectorAll('li')].map(li=>li.querySelector('.label').textContent+' = '+li.querySelector('kbd').textContent+' → '+li.querySelector('.state').textContent)})()""")

    # ---- popup dell'estensione, aperto in una scheda
    async def popup(self, width=680, height=580, query=''):
        pg = await self.ctx.new_page()
        await pg.set_viewport_size({'width': width, 'height': height})
        pg.on('pageerror', lambda e: self._log(f'POPUP ERROR {e}'))
        pg.on('console', lambda m: self._log(f'POPUP {m.text}') if m.type in ('error', 'warning') else None)
        await pg.goto(f'chrome-extension://{self.ext_id}/src/popup/popup.html{query}')
        await asyncio.sleep(0.5)
        return pg


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f'  ✓ {msg}', flush=True)
