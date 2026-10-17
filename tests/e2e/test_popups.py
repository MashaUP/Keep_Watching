"""Popup per categoria e controllo globale: nascondere un popup non spegne mai la funzione."""
import asyncio
from kw import KW, check, config

ALL_ON = {'countdown': True, 'confirm': True, 'limit': True, 'sleep': True, 'recovery': True, 'info': True}


async def main():
    print('— conto alla rovescia nascosto: il cambio avviene comunque, dopo lo stesso tempo')
    async with KW(quiet=True) as k:
        await k.set({'countdown': 5, 'popups': {**ALL_ON, 'countdown': False}})
        await k.open()
        await asyncio.sleep(1)
        await k.seek(88)
        await asyncio.sleep(4)
        v = await k.video()
        check(await k.panel() is None and v['ep'] == '1', f'nessun riquadro, ancora episodio 1 un paio di secondi dopo la fine ({v["ep"]})')
        await asyncio.sleep(4.5)
        check((await k.video())['ep'] == '2', 'cambio episodio avvenuto dopo il conto alla rovescia nascosto')

    print('— controllo globale: intro saltata senza riquadro, preferenze singole conservate')
    async with KW(quiet=True) as k:
        await k.set({'countdown': 0, 'popupsHidden': True, 'popups': {**ALL_ON, 'info': False},
                     'series': {'Brothers': {'introEnd': 20}}})
        await k.open()
        await asyncio.sleep(1.5)
        v = await k.video()
        check(v['t'] >= 20 and await k.panel() is None, f'intro saltata senza "Intro saltata" (t={v["t"]})')
        st = (await k.get('stats'))['stats']
        day = list(st['days'].values())[0] if st and st['days'] else {}
        check(day.get('intro') == 1, f'il salto conta nelle statistiche anche senza popup ({day.get("intro")})')
        await k.set({'popupsHidden': False})
        p = (await k.get('popups'))['popups']
        check(p['info'] is False and p['countdown'] is True, f'preferenze singole intatte dopo aver tolto il controllo globale: {p}')

    print('— domanda del limite nascosta: ci si ferma; "prossimo episodio" a mano continua e azzera')
    async with KW(quiet=True) as k:
        await k.set({'countdown': 0, 'stopAfter': 1, 'streak': 0, 'lastAutoAt': 0, 'popups': {**ALL_ON, 'limit': False}})
        await k.open()
        await asyncio.sleep(1)
        await k.seek(88)
        await asyncio.sleep(3.5)
        check((await k.video())['ep'] == '2', 'primo cambio automatico')
        await k.seek(88)
        await asyncio.sleep(4)
        v = await k.video()
        check(v['ep'] == '2' and await k.panel() is None, 'al limite: nessuna domanda e nessun cambio (scelta sicura)')
        await k.player().click('text=NEXT')
        await asyncio.sleep(2.5)
        check((await k.video())['ep'] == '3', 'cambio manuale con il pulsante del player')
        check((await k.get('streak'))['streak'] == 0, 'conteggio di fila azzerato dalla scelta manuale')
        notes = await k.notes()
        await k.seek(88)
        await asyncio.sleep(3)
        notes = await k.notes()
        check(any('episodi finiti' in n for n in notes), f'notifica di fine serie inviata anche con popup nascosti: {notes}')

    print('— timer di spegnimento con popup nascosto: il video si ferma comunque')
    async with KW(quiet=True) as k:
        await k.set({'countdown': 0, 'popups': {**ALL_ON, 'sleep': False}})
        await k.open()
        await asyncio.sleep(1)
        until = await k.sw.evaluate('Date.now() + 3000')
        await k.set({'sleep': {'mode': 'time', 'minutes': 1, 'until': until}})
        await asyncio.sleep(4.5)
        v = await k.video()
        check(v['paused'] and await k.panel() is None, f'video fermo senza riquadro: {v}')

    print('— streaming bloccato con popup nascosti: il recupero avviene comunque')
    async with KW(quiet=True) as k:
        await config(k.page, stall=1)
        await k.set({'countdown': 0, 'popupsHidden': True})
        await k.open()
        for _ in range(45):
            await asyncio.sleep(1)
            f = k.player()
            if f and 'minute=' in f.url:
                break
        f = k.player()
        check(f and 'minute=' in f.url, 'episodio ricaricato con minute= (recupero eseguito)')
        await asyncio.sleep(2)
        check(await k.toast() is None, 'nessun avviso di recupero mostrato')
        await config(k.page, stall=0)


asyncio.run(main())
