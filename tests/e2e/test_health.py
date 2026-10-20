"""
Stato del player, Centro salute, Verifica tutto e cronologia eventi sul sito di prova:
funzionamento normale, cambio episodio riuscito, clic senza effetto, pagina senza player,
player senza video, pagina non supportata, streaming bloccato e recuperato, menu.

Avvio: python3 server.py &  poi  xvfb-run -a python3 test_health.py
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


def by_id(res):
    return {c['id']: c for c in res['result']['checks']}


async def main():
    print('Funzionamento normale')
    async with KW(quiet=True) as k:
        await k.set({'countdown': 0})
        await k.open()
        await asyncio.sleep(3)
        th = await wait_for(lambda: _state(k, 'playing'), 8)
        check(th and th['player']['state'] == 'playing', f'stato del player: in riproduzione ({th and th["player"]["state"]})')
        check(th['site'].get('recognized') is True, 'pagina dell\'episodio riconosciuta')
        tab_id = th['tabId']
        before = await k.video()
        res = await k.verify(tab_id)
        after = await k.video()
        c = by_id(res)
        for cid in ('site', 'frame', 'player', 'controls', 'autoplay', 'storage', 'errors', 'recovery'):
            check(c[cid]['status'] == 'ok', f'{c[cid]["label"]}: Funzionante — {c[cid]["text"]}')
        check(c['next']['status'] == 'check' and 'solo a fine episodio' in c['next']['text'], 'prossimo episodio "da verificare": solo il pulsante è stato controllato')
        check(c['intro']['status'] == 'check' and c['credits']['status'] == 'na' and c['credits']['detail'] == 'off', 'intro non segnata (da verificare), titoli spenti (disattivati da te)')
        check(after['ep'] == before['ep'] and not after['paused'] and 0 <= after['t'] - before['t'] < 5, f'verifica non distruttiva: stesso episodio, nessuna pausa, nessun salto ({before["t"]} → {after["t"]})')
        msgs = await k.event_msgs()
        check(any('Pagina dell\'episodio riconosciuta' in m for m in msgs) and any(m.startswith('Player rilevato') for m in msgs) and any(m.startswith('Verifica tutto:') for m in msgs),
              f'cronologia: sito, player e verifica registrati')
        check(not any('token' in m or '?' in m.split('[')[0] for m in msgs), 'cronologia senza parametri degli indirizzi')

        await k.seek((await k.video())['dur'] - 2)
        check(await wait_for(lambda: _ep(k, '2'), 12), 'cambio episodio automatico')
        await k.wait_player()
        th = await wait_for(lambda: _arrived(k), 8)
        check(th and th['player']['arrivedBySwitch'], 'il nuovo player sa di essere arrivato da un cambio riuscito')
        res = await k.verify(tab_id)
        check(by_id(res)['next']['status'] == 'ok', f'prossimo episodio "Funzionante" dopo un cambio vero: {by_id(res)["next"]["text"]}')
        msgs = await k.event_msgs()
        check(any(m.startswith('Cambio episodio (Episodio finito)') for m in msgs) and any('Cambio riuscito' in m for m in msgs), 'cronologia: clic e cambio riuscito')

        print('Menu: questa scheda, Centro salute, cronologia')
        pg = await k.popup()
        await asyncio.sleep(0.6)
        card = await pg.text_content('#tabStatus')
        check('In riproduzione' in card and 'Brothers' in card and 'StreamingCommunity' in card, f'Panoramica: stato della scheda con il player ({card})')
        await pg.click('#tabStatus button:has-text("Verifica tutto")')
        await wait_for(lambda: pg.is_visible('#hcSummary'), 6)
        await wait_for(lambda: pg.is_enabled('#verifyAll'), 6)
        items = await pg.eval_on_selector_all('#hcList .hc-item', 'l => l.map(x => x.querySelector(".hc-label").textContent + "=" + x.querySelector(".hc-status").textContent)')
        check(len(items) >= 10 and 'Sito riconosciuto=Funzionante' in items, f'Centro salute: {len(items)} verifiche mostrate')
        check('Funzionante' in await pg.text_content('#hcSummary'), 'riepilogo con i conteggi')
        await pg.click('.nav button[data-section="log"]')
        n_all = await pg.eval_on_selector_all('#logList li', 'l => l.length')
        await pg.click('#logFilter button[data-value="error"]')
        n_err = await pg.eval_on_selector_all('#logList li', 'l => l.length')
        check(n_all >= 4 and n_err == 0, f'cronologia nel menu: {n_all} eventi, nessun errore')
        async with pg.expect_download() as d:
            await pg.click('#logExport')
        import json
        data = json.load(open(await (await d.value).path()))
        check(data['schema'] == 'keep-watching-log' and len(data['events']) == len(await k.events()), 'esportazione della cronologia')
        await pg.click('#logClear')
        await pg.click('#logClearGo')
        await asyncio.sleep(0.4)
        left = await k.event_msgs()
        check(len(left) == 0, f'cronologia cancellata (con conferma) {left}')
        check((await k.get('countdown'))['countdown'] == 0, 'cancellare la cronologia non tocca le impostazioni')

    print('Player su vixcloud.cc (dominio usato dal sito da ottobre 2026)')
    async with KW(quiet=True) as k:
        await config(k.page, playerhost='vixcloud.cc')
        await k.set({'countdown': 0})
        await k.open()
        check('vixcloud.cc' in k.player().url and 'kw_autoplay=1' in k.player().url, 'player su vixcloud.cc caricato con il permesso di autoplay')
        await asyncio.sleep(3)
        th = await wait_for(lambda: _state(k, 'playing'), 8)
        check(th, 'script del player attivo su vixcloud.cc: in riproduzione')
        res = await k.verify(th['tabId'])
        c = by_id(res)
        check(all(c[x]['status'] == 'ok' for x in ('site', 'frame', 'player', 'autoplay')) and 'vixcloud.cc' in c['frame']['text'],
              f'Verifica tutto: sito, iframe ({c["frame"]["text"]}), player e autoplay Funzionante')
        await k.seek((await k.video())['dur'] - 2)
        check(await wait_for(lambda: _ep(k, '2'), 12), 'cambio episodio automatico anche su vixcloud.cc')
        await config(k.page, playerhost='vixcloud.co')

    print('Player su un dominio non ancora supportato')
    async with KW(quiet=True) as k:
        await config(k.page, playerhost='vixcloud.xyz')
        await k.page.goto('http://127.0.0.1:8000/it/watch/1')
        msgs = await wait_for(lambda: _has(k, 'Player su un dominio non supportato: vixcloud.xyz'), 22)
        check(msgs, f'cronologia: il dominio del player è indicato per nome ({msgs})')
        th = await k.tab_health()
        res = await k.verify(th['tabId'])
        c = by_id(res)
        check(c['site']['status'] == 'ok' and c['frame']['detail'] == 'error' and 'vixcloud.xyz' in c['frame']['text'], f'Verifica tutto: {c["frame"]["text"]}')
        check(th['site'].get('otherPlayer') == 'vixcloud.xyz', 'stato della scheda con il dominio trovato')
        await config(k.page, playerhost='vixcloud.co')

    print('Clic su "prossimo episodio" senza effetto')
    async with KW(quiet=True) as k:
        await config(k.page, deadnext=1)
        await k.set({'countdown': 0})
        await k.open()
        await asyncio.sleep(1.5)
        await k.seek((await k.video())['dur'] - 2)
        msgs = await wait_for(lambda: _has(k, 'Il clic non ha cambiato episodio'), 25)
        check(msgs, 'dopo 15 s: il clic non ha avuto effetto, un secondo tentativo')
        p = await wait_for(k.panel, 25)
        check(p and p.startswith('Cambio episodio non riuscito') and 'Chiudi/Riprova' in p, f'dopo il secondo tentativo: avviso con Riprova ({p})')
        evs = await k.events()
        clicks = sum(e.get('count', 1) for e in evs if e['msg'].startswith('Cambio episodio ('))
        check(clicks == 2, f'esattamente due clic, nessuna cascata ({clicks})')
        await asyncio.sleep(20)
        evs = await k.events()
        check(sum(e.get('count', 1) for e in evs if e['msg'].startswith('Cambio episodio (')) == 2, 'nessun altro clic nei 20 s successivi')
        check(any(e['msg'] == 'Cambio episodio non riuscito' and e['level'] == 'error' for e in evs), 'errore in cronologia con l\'esito')
        th = await k.tab_health()
        check(th['player']['state'] == 'fatal' and th['player']['lastNext']['result'] == 'failed', f'stato: serve un\'azione ({th["player"]["state"]})')
        check((await k.video())['ep'] == '1', 'nessun cambio di episodio inventato')
        res = await k.verify(th['tabId'])
        nx = by_id(res)['next']
        check(nx['status'] == 'na' and nx['detail'] == 'error', f'Verifica tutto: prossimo episodio in errore — {nx["text"]}')
        await config(k.page, deadnext=0)

    print('Pagina dell\'episodio senza player')
    async with KW(quiet=True) as k:
        await config(k.page, noplayer=1)
        await k.page.goto('http://127.0.0.1:8000/it/watch/1')
        msgs = await wait_for(lambda: _has(k, 'senza un player supportato'), 22)
        check(msgs, 'cronologia: pagina dell\'episodio senza player')
        th = await k.tab_health()
        res = await k.verify(th['tabId'])
        c = by_id(res)
        check(c['site']['status'] == 'ok' and c['frame']['status'] == 'na' and c['frame']['detail'] == 'error', f'iframe dell\'episodio in errore: {c["frame"]["text"]}')
        check(c['player']['status'] == 'na', f'player non disponibile: {c["player"]["text"]}')
        await config(k.page, noplayer=0)

    print('Player senza video')
    async with KW(quiet=True) as k:
        await config(k.page, novideo=1)
        await k.page.goto('http://127.0.0.1:8000/it/watch/1')
        msgs = await wait_for(lambda: _has(k, 'Nessun video nel player dopo 30 secondi'), 40)
        check(msgs and 'Contenitore JW Player presente' in ' '.join(msgs), 'cronologia: player senza video, con la causa probabile')
        th = await wait_for(lambda: _state(k, 'unsupported'), 5)
        check(th and th['player']['state'] == 'unsupported', f'stato: non compatibile ({th and th["player"]["state"]})')
        res = await k.verify(th['tabId'])
        check(by_id(res)['player']['detail'] == 'error', 'Verifica tutto: player in errore')
        await config(k.page, novideo=0)

        print('Pagina non supportata')
        tab_id = th['tabId']
        await k.page.goto('http://127.0.0.1:8000/altro')
        await asyncio.sleep(0.5)
        res = await k.verify(tab_id)
        c = by_id(res)
        check(c['site']['status'] == 'na' and c['site']['detail'] == 'unsupported' and 'player' not in c, f'pagina qualsiasi: "non supportata", nessuna verifica del player ({c["site"]["text"]})')
        check(c['storage']['status'] == 'ok', 'memoria verificata anche fuori dal sito')
        check(await k.tab_health() is None or (await k.tab_health())['tabId'] != tab_id, 'uscendo dal sito lo stato della scheda viene azzerato')

    print('Streaming bloccato e recuperato')
    async with KW(quiet=True) as k:
        await config(k.page, stall=1)
        await k.set({'countdown': 0})
        await k.open()
        ok = await wait_for(lambda: _has(k, 'riuscita: il video è ripartito'), 70, 1)
        msgs = await k.event_msgs()
        check(any(m.startswith('Video bloccato') for m in msgs), 'cronologia: blocco rilevato con il tipo (buffering o fermo)')
        check(any('Ricarica dell\'episodio: chiesta al sito' in m for m in msgs), 'cronologia: ricarica chiesta al sito')
        check(ok, 'cronologia: ripresa verificata (il video è ripartito dopo la ricarica)')
        th = await wait_for(lambda: _recovered(k), 5)
        check(th, 'Centro salute: ultimo recupero riuscito')
        await config(k.page, stall=0)


async def _state(k, state):
    th = await k.tab_health()
    return th if th and th.get('player') and th['player']['state'] == state and th.get('site') else None


async def _arrived(k):
    th = await k.tab_health()
    return th if th and th.get('player') and th['player'].get('arrivedBySwitch') else None


async def _recovered(k):
    th = await k.tab_health()
    lr = th and th.get('player') and th['player'].get('lastRecovery')
    return th if lr and 'riuscita' in lr['result'] else None


async def _ep(k, n):
    try:
        return (await k.video())['ep'] == n
    except Exception:
        return False


async def _has(k, text):
    msgs = await k.event_msgs()
    found = [m for m in msgs if text in m]
    return found or None


asyncio.run(main())
print('OK test_health')
