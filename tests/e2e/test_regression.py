"""
Funzioni delle versioni precedenti, da riprovare a ogni rilascio: conto alla rovescia con
Annulla e Vai ora, domanda dopo N episodi, timer di spegnimento (a tempo, fine episodio,
fine stagione), interruttore generale da scorciatoia, segni di intro e titoli da scorciatoia,
avviso quando il pulsante "prossimo episodio" manca.

Avvio: python3 server.py &  poi  xvfb-run -a python3 test_regression.py
"""
import asyncio, time
from kw import KW, check, config


async def wait_for(fn, timeout=15, step=0.25):
    end = time.time() + timeout
    while time.time() < end:
        r = await fn()
        if r:
            return r
        await asyncio.sleep(step)
    return await fn()


async def ep(k):
    try:
        return (await k.video())['ep']
    except Exception:
        return None


async def to_end(k, left=3):
    v = await k.video()
    await k.seek(v['dur'] - left)


async def main():
    print('Conto alla rovescia visibile')
    async with KW(quiet=True) as k:
        await k.set({'countdown': 5})
        await k.open()
        await asyncio.sleep(1)
        await to_end(k)
        p = await wait_for(k.panel, 8)
        check(p and p.startswith('Prossimo episodio di Brothers') and 'Annulla/Vai ora' in p, f'riquadro del conto alla rovescia: {p}')
        await k.click_panel('Vai ora')
        check(await wait_for(lambda: _is(k, '2'), 10), '"Vai ora": episodio 2 subito')
        await k.wait_player()
        await asyncio.sleep(1.5)
        await to_end(k)
        await wait_for(k.panel, 8)
        await k.click_panel('Annulla')
        await asyncio.sleep(8)
        check(await ep(k) == '2' and await k.panel() is None, '"Annulla": resta sull\'episodio 2')

    print('Domanda dopo N episodi di fila')
    async with KW(quiet=True) as k:
        await k.set({'countdown': 0, 'stopAfter': 1})
        await k.open()
        await asyncio.sleep(1)
        await to_end(k)
        check(await wait_for(lambda: _is(k, '2'), 12), 'primo episodio: cambio automatico')
        await k.wait_player()
        await asyncio.sleep(1.5)
        await to_end(k)
        p = await wait_for(k.panel, 10)
        check(p and p.startswith('Vuoi continuare a guardare?') and 'Basta così/Continua' in p, f'al limite chiede se continuare: {p}')
        await k.click_panel('Continua')
        check(await wait_for(lambda: _is(k, '3'), 12), '"Continua": episodio 3')

    print('Timer di spegnimento')
    async with KW(quiet=True) as k:
        await k.open()
        await asyncio.sleep(1)
        vol = (await k.video())['vol']
        await k.set({'sleep': {'mode': 'time', 'minutes': 1, 'until': int(time.time() * 1000) + 4000}})
        v = await wait_for(lambda: _paused(k), 12)
        p = await k.panel()
        check(v and p and p.startswith('Timer di spegnimento') and 'Riprendi' in p, f'a tempo: video fermo con il riquadro ({p})')
        check((await k.video())['vol'] == vol, f'volume ripristinato dopo la dissolvenza ({vol})')
        check((await k.get('sleep'))['sleep']['mode'] == 'off', 'timer spento dopo lo stop')

        await k.click_panel('Riprendi')
        await asyncio.sleep(1)
        await k.set({'sleep': {'mode': 'episode', 'setAt': int(time.time() * 1000)}})
        await asyncio.sleep(0.5)
        await to_end(k, 4)
        v = await wait_for(lambda: _paused(k), 12)
        p = await k.panel()
        check(v and await ep(k) == '1' and p and 'fine episodio' in p, f'fine episodio: fermo sull\'episodio 1 ({p})')

    async with KW(quiet=True) as k:
        await config(k.page, last=3)
        await k.set({'countdown': 0, 'sleep': {'mode': 'season', 'season': None, 'setAt': int(time.time() * 1000)}})
        await k.open()
        await asyncio.sleep(1.5)
        check((await k.get('sleep'))['sleep'].get('season') == 1, 'fine stagione: stagione 1 memorizzata')
        await to_end(k)
        check(await wait_for(lambda: _is(k, '2'), 12), 'dentro la stagione il cambio continua')
        await k.wait_player()
        await asyncio.sleep(1.5)
        await to_end(k)
        check(await wait_for(lambda: _is(k, '3'), 12), 'caricato il primo episodio della stagione 2')
        await k.wait_player()
        p = await wait_for(k.panel, 10)
        await asyncio.sleep(1)
        check(p and 'Stagione 1 finita' in p and (await k.video())['paused'], f'fine stagione: video fermo ({p})')

    print('Scorciatoie: interruttore, segni di intro e titoli')
    async with KW(quiet=True) as k:
        await k.set({'countdown': 0})
        await k.open()
        await asyncio.sleep(1)
        check(await k.command('toggle-enabled') == 'toggled' and (await k.get('enabled'))['enabled'] is False, 'Alt+Shift+K: estensione sospesa')
        await to_end(k)
        await asyncio.sleep(6)
        check(await ep(k) == '1', 'sospesa: nessun cambio episodio')
        await k.command('toggle-enabled')
        check((await k.get('enabled'))['enabled'] is True, 'Alt+Shift+K: di nuovo attiva')

        await k.seek(20)
        await k.player().evaluate("document.querySelector('video').play()")
        await asyncio.sleep(1)
        check(await k.command('mark-intro') == 'sent', 'comando "segna fine intro" consegnato al player')
        s = await wait_for(lambda: _series(k), 5)
        check(s and 19 <= s.get('introEnd', 0) <= 24, f'fine intro salvata per la serie: {s}')
        await to_end(k, 20)
        await asyncio.sleep(0.5)
        await k.command('mark-credits')
        s = await wait_for(lambda: _series(k, 'creditsStart'), 5)
        check(s and 17 <= s.get('creditsStart', 0) <= 22, f'inizio titoli salvato: {s}')

    print('Pulsante "prossimo episodio" mancante')
    async with KW(quiet=True) as k:
        await config(k.page, broken=1)
        await k.set({'countdown': 0})
        await k.open()
        await asyncio.sleep(1)
        await to_end(k)
        notes = await wait_for(lambda: _note(k, 'pulsante non trovato'), 12)
        check(notes, 'notifica: pulsante non trovato')
        await config(k.page, broken=0)


async def _is(k, n):
    return await ep(k) == n


async def _paused(k):
    try:
        v = await k.video()
        return v if v['paused'] else None
    except Exception:
        return None


async def _series(k, key='introEnd'):
    s = ((await k.get('series')).get('series') or {}).get('Brothers') or {}
    return s if key in s else None


async def _note(k, text):
    notes = await k.notes()
    return [n for n in notes if text in n]


asyncio.run(main())
print('OK test_regression')
