"""Pulsante di salto avanti: ripetibile, durata configurabile, fine del video, pausa, ricreazione."""
import asyncio
from kw import KW, check, config


async def main():
    async with KW() as k:
        await config(k.page, clip='long')
        await k.set({'countdown': 0, 'autoNext': False})
        await k.open()
        await asyncio.sleep(1.5)

        bar = await k.toolbar()
        check(bar and '+60 s' in bar, f'barra con +60 s di serie: {bar}')

        times = []
        for i in range(6):
            await k.click_toolbar('+60 s')
            await asyncio.sleep(0.4)
            times.append((await k.video())['t'])
            bar = await k.toolbar(hover=False)
            check(bar and '+60 s' in bar, f'dopo il salto {i + 1} il pulsante c\'è ancora (t={times[-1]})')
        check(all(b - a >= 59 for a, b in zip(times, times[1:])), f'ogni salto avanza di 60 s: {times}')

        # Pausa e ripresa
        await k.player().evaluate("document.querySelector('video').pause()")
        await k.click_toolbar('+60 s')
        await asyncio.sleep(0.3)
        v = await k.video()
        check(v['paused'] and v['t'] >= times[-1] + 59, f'salto anche con il video in pausa: {v}')
        await k.player().evaluate("document.querySelector('video').play()")
        await k.click_toolbar('+60 s')
        await asyncio.sleep(0.3)
        check((await k.video())['t'] >= v['t'] + 59, 'salto dopo la ripresa')

        # Durata configurabile, applicata subito
        await k.set({'quickSkip': 15})
        await asyncio.sleep(0.4)
        bar = await k.toolbar()
        check('+15 s' in bar, f'etichetta aggiornata a +15 s: {bar}')
        t0 = (await k.video())['t']
        for _ in range(5):
            await k.click_toolbar('+15 s')
        await asyncio.sleep(0.3)
        t1 = (await k.video())['t']
        check(74 <= t1 - t0 <= 78, f'5 salti da 15 s = circa 75 s ({t1 - t0:.1f})')

        # Fine del video: mai oltre
        await k.set({'quickSkip': 90})
        await k.seek(700)
        await asyncio.sleep(0.4)
        await k.click_toolbar('+90 s')
        await asyncio.sleep(0.4)
        v = await k.video()
        check(v['t'] <= v['dur'] - 0.5, f'non supera la fine del video: {v}')

        # Ricreazione del contenitore del player (come quando JW Player ridisegna)
        await k.seek(100)
        await k.player().evaluate("""(()=>{const old=document.querySelector('.jwplayer'); const n=old.cloneNode(false);
            while(old.firstChild) n.appendChild(old.firstChild); old.replaceWith(n);})()""")
        await asyncio.sleep(0.4)
        bar = await k.toolbar()
        check(bar and '+90 s' in bar, f'barra di nuovo presente dopo la ricreazione: {bar}')
        count = await k.player().evaluate("document.querySelectorAll('[data-kw=\"toolbar\"]').length")
        check(count == 1, f'una sola barra, niente duplicati ({count})')
        t0 = (await k.video())['t']
        await k.click_toolbar('+90 s')
        await asyncio.sleep(0.3)
        check((await k.video())['t'] >= t0 + 89, 'il salto funziona dopo la ricreazione')

        # Scorciatoia da tastiera: stesso salto
        t0 = (await k.video())['t']
        res = await k.command('quick-skip')
        await asyncio.sleep(0.4)
        check(res == 'sent' and (await k.video())['t'] >= t0 + 89, f'scorciatoia salto avanti ({res})')
        check((await k.toast()) == 'Avanti di 90 s', 'avviso della scorciatoia')

        # Mentre si scrive nella casella di ricerca del sito, la scorciatoia non fa nulla
        await k.page.click('#search')
        t0 = (await k.video())['t']
        res = await k.command('quick-skip')
        await asyncio.sleep(0.3)
        check(res == 'editing' and abs((await k.video())['t'] - t0) < 5, f'ignorata mentre si scrive ({res})')
        await config(k.page, clip='short')


asyncio.run(main())
