"""Statistiche: si conta solo la riproduzione reale; completamenti, intro e titoli senza doppioni."""
import asyncio
from kw import KW, check, config


async def today(k):
    st = (await k.get('stats'))['stats'] or {'days': {}}
    key = await k.sw.evaluate('KWStats.dayKey(Date.now())')
    return st['days'].get(key, {}), st


async def flush(k):
    # Mettere in pausa fa mandare subito il tempo misurato al service worker.
    await k.player().evaluate("document.querySelector('video').pause()")
    await asyncio.sleep(0.8)


async def main():
    print('— tempo reale: riproduzione sì, pausa e salti no')
    async with KW(quiet=True) as k:
        await config(k.page, clip='long')
        await k.set({'countdown': 0, 'autoNext': False})
        await k.open()
        await asyncio.sleep(8)
        await flush(k)
        d, st = await today(k)
        check(6.5 <= d.get('play', 0) <= 9, f'circa 8 s di visione ({d.get("play", 0):.1f})')
        check(d.get('sessions') == 1, 'una sessione')
        await asyncio.sleep(5)  # in pausa: non conta
        await k.seek(400)      # salto in avanti: non conta
        await asyncio.sleep(0.5)
        await flush(k)
        d2, _ = await today(k)
        check(abs(d2.get('play', 0) - d['play']) < 1, f'pausa e salto non aggiungono tempo ({d2.get("play", 0):.1f})')
        await k.player().evaluate("document.querySelector('video').playbackRate = 2")
        await k.player().evaluate("document.querySelector('video').play()")
        await asyncio.sleep(6)
        await flush(k)
        d3, _ = await today(k)
        added = d3['play'] - d2['play']
        check(4.5 <= added <= 7.5, f'a velocità 2× conta il tempo reale, non quello del video (+{added:.1f} s)')
        check(d3['sessions'] == 1, 'sempre la stessa sessione dopo la pausa')
        now_playing = await k.sw.evaluate("chrome.storage.session.get('nowPlaying')")
        check(now_playing['nowPlaying']['title'] == 'Brothers', f'stato del player per il menu: {now_playing}')
        await config(k.page, clip='short')

    print('— caricamento bloccato: non conta')
    async with KW(quiet=True) as k:
        await config(k.page, stall=1)
        await k.set({'countdown': 0, 'watchdog': False})
        await k.open()
        await asyncio.sleep(25)
        await flush(k)
        d, _ = await today(k)
        v = await k.video()
        check(d.get('play', 0) <= v['t'] + 2, f'tempo contato ({d.get("play", 0):.1f} s) non oltre il video davvero suonato ({v["t"]} s)')
        await config(k.page, stall=0)

    print('— episodi completati, intro e titoli saltati')
    async with KW(quiet=True) as k:
        await k.set({'countdown': 0, 'series': {'Brothers': {'introEnd': 5, 'creditsStart': 20}}})
        await k.open()
        await asyncio.sleep(1.5)
        # Salto quasi alla fine: titoli raggiunti ma episodio non guardato → non completato
        await k.seek(68)
        await asyncio.sleep(4)
        d, _ = await today(k)
        check((await k.video())['ep'] == '2', 'cambio episodio ai titoli segnati')
        check(d.get('completed', 0) == 0, 'saltando alla fine l\'episodio non conta come completato')
        check(d.get('credits') == 1, 'titoli saltati dall\'estensione: 1')
        check(d.get('intro') >= 1, f'intro saltata dall\'estensione ({d.get("intro")})')
        # Episodio 2 guardato quasi tutto (60 s reali) fino ai titoli → completato
        await k.seek(8)
        await asyncio.sleep(64)
        d, _ = await today(k)
        check(d.get('completed') == 1, f'episodio guardato fino ai titoli: completato ({d.get("completed")})')
        check(d.get('credits') == 2, f'secondi titoli saltati ({d.get("credits")})')
        # Il salto manuale con "Salta intro" non conta
        before = d.get('intro')
        await k.seek(0)
        await asyncio.sleep(0.5)
        await k.click_toolbar('Salta intro')
        await asyncio.sleep(0.5)
        d, _ = await today(k)
        check(d.get('intro') == before, 'il salto manuale dell\'intro non conta')

    print('— raccolta disattivata e azzeramento')
    async with KW(quiet=True) as k:
        await k.set({'countdown': 0, 'statsEnabled': False, 'stats': {'schema': 1, 'days': {'2026-01-01': {'play': 50, 'sessions': 1}}, 'sessions': [], 'session': None, 'recent': []}})
        await k.open()
        await asyncio.sleep(5)
        await flush(k)
        d, st = await today(k)
        check(not d.get('play') and '2026-01-01' in st['days'], 'raccolta spenta: niente dati nuovi, lo storico resta')
        pg = await k.popup()
        res = await pg.evaluate("chrome.runtime.sendMessage({type:'kwStatsReset'})")
        st = (await k.get('stats'))['stats']
        check(res['ok'] and st['days'] == {}, 'azzeramento: storico vuoto')
        s = await k.get(['statsEnabled', 'countdown'])
        check(s['statsEnabled'] is False and s['countdown'] == 0, 'l\'azzeramento non tocca le impostazioni')


asyncio.run(main())
