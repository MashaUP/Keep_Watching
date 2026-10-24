"""
Collegamenti ufficiali nel menu: icone da src/lib/links.js, configurazione remota links.json
(GitHub finto), validazione, cache e ripiego sui valori di serie. Più l'impostazione
"Parti anche con il browser ridotto a icona".

Avvio: python3 server.py &  poi  xvfb-run -a python3 test_links.py
"""
import asyncio, json, time
from kw import KW, check

LINKS = 'contents/links.json'


async def nav_links(pg):
    return await pg.eval_on_selector_all('#navLinks a', 'l => l.map(a => [a.dataset.link, a.href, a.target, a.rel, a.title, a.getAttribute("aria-label")])')


async def links_when(pg, cond, timeout=5):
    end = time.time() + timeout
    while True:
        d = dict((x[0], x[1]) for x in await nav_links(pg))
        if cond(d) or time.time() > end:
            return d
        await asyncio.sleep(0.2)


async def main():
    async with KW(quiet=True) as k:
        print('Collegamenti di serie (links.json non pubblicato)')
        pg = await k.popup()
        await asyncio.sleep(0.8)
        nl = await nav_links(pg)
        ids = [x[0] for x in nl]
        check(ids == ['github', 'discord', 'kofi', 'documentation'], f'icone nella barra: {ids}')
        d = dict((x[0], x) for x in nl)
        check(d['github'][1] == 'https://github.com/MashaUP/Keep_Watching' and d['discord'][1] == 'https://discord.gg/EPsbQCuAkx'
              and d['kofi'][1] == 'https://ko-fi.com/mashaup', 'GitHub, Discord e Ko-fi con gli indirizzi ufficiali')
        check(all(x[2] == '_blank' and 'noopener' in x[3] and x[4] and 'nuova scheda' in x[5] for x in nl), 'nuova scheda, senza referrer, con suggerimento ed etichetta accessibile')
        check(not any(x[0] in ('bug-report', 'feature-request') for x in nl), 'segnalazioni predisposte ma spente: non mostrate')
        box = await (await pg.query_selector('#navLinks a[data-link="discord"]')).bounding_box()
        check(box['width'] <= 28 and box['height'] <= 28, f'icone piccole ({box["width"]}×{box["height"]} px)')
        await pg.focus('#navLinks a[data-link="github"]')
        await pg.keyboard.press('Tab')
        check(await pg.evaluate('document.activeElement.dataset.link') == 'discord', 'raggiungibili con Tab')
        # Il sandbox non raggiunge discord.gg: una pagina finta conferma la destinazione.
        await k.ctx.route('https://discord.gg/**', lambda r: r.fulfill(status=200, body='<title>Discord finto</title>', headers={'content-type': 'text/html'}))
        async with k.ctx.expect_page() as newp:
            await pg.click('#navLinks a[data-link="discord"]')
        p2 = await newp.value
        await p2.wait_for_load_state()
        check(p2.url == 'https://discord.gg/EPsbQCuAkx', f'Discord si apre in una nuova scheda ({p2.url})')
        await p2.close()
        await pg.click('.nav button[data-section="kofi"]')
        items = await pg.eval_on_selector_all('#linkList a', 'l => l.map(a => a.dataset.link)')
        check(items == ['github', 'discord', 'documentation'], f'Sostieni: elenco Community e aiuto senza doppione di Ko-fi ({items})')
        check('di serie' in await pg.text_content('#linksSource'), 'fonte dichiarata: collegamenti di serie')
        check(await pg.get_attribute('#repoLink', 'href') == 'https://github.com/MashaUP/Keep_Watching', 'Aggiornamenti: repository dalla stessa fonte')
        cache = (await k.get('linksRemote'))['linksRemote']
        check(cache and cache['data'] is None, 'links.json assente: nessuna configurazione remota, valori di serie')
        await pg.close()

        print('Configurazione remota valida: Discord cambiato senza nuova versione')
        remote = {'schema': 1, 'links': {'discord': {'url': 'https://discord.gg/NUOVOINVITO'}, 'bug-report': {'enabled': True}}}
        k.github = {LINKS: (200, json.dumps(remote))}
        await k.set({'linksRemote': None})
        pg = await k.popup()
        d = await links_when(pg, lambda d: d.get('discord') == 'https://discord.gg/NUOVOINVITO')
        check(d.get('discord') == 'https://discord.gg/NUOVOINVITO', f'Discord dalla configurazione remota ({d.get("discord")})')
        check(d.get('bug-report') == 'https://github.com/MashaUP/Keep_Watching/issues/new', 'segnalazioni accese dalla configurazione remota')
        check('aggiornati dal repository' in await pg.text_content('#linksSource'), 'fonte dichiarata: repository')
        calls = len(k.github_calls)
        await pg.reload()
        await asyncio.sleep(0.8)
        check(len([c for c in k.github_calls[calls:] if 'links.json' in c]) == 0, 'riaprendo il menu: cache usata, nessuna nuova richiesta')
        await pg.close()

        print('Errori: rete assente, JSON non valido, indirizzi pericolosi')
        k.github = {LINKS: 'abort'}
        c = (await k.get('linksRemote'))['linksRemote']
        await k.set({'linksRemote': {**c, 'at': 0}})
        pg = await k.popup()
        await asyncio.sleep(1)
        d = dict((x[0], x[1]) for x in await nav_links(pg))
        c = (await k.get('linksRemote'))['linksRemote']
        check(d.get('discord') == 'https://discord.gg/NUOVOINVITO' and c.get('lastError'), f'rete assente: resta l\'ultima configurazione valida ({c.get("lastError")})')
        await pg.close()

        k.github = {LINKS: (200, '{"schema":1,"links":{"discord":{"url":"javascript:alert(1)"},"github":{"url":"http://github.com/x"}}}')}
        await k.set({'linksRemote': None})
        pg = await k.popup()
        await asyncio.sleep(1)
        d = dict((x[0], x[1]) for x in await nav_links(pg))
        check(d['discord'] == 'https://discord.gg/EPsbQCuAkx' and d['github'] == 'https://github.com/MashaUP/Keep_Watching', 'indirizzi non sicuri rifiutati: restano quelli di serie')
        hrefs = await pg.eval_on_selector_all('a[href]', 'l => l.map(a => a.getAttribute("href"))')
        check(not any(h.startswith(('javascript:', 'data:', 'http:')) for h in hrefs), 'nessun collegamento pericoloso nella pagina')
        await pg.close()

        k.github = {LINKS: (200, '{rotto')}
        await k.set({'linksRemote': None})
        pg = await k.popup()
        await asyncio.sleep(1)
        check(len(await nav_links(pg)) == 4, 'JSON malformato: collegamenti di serie, menu funzionante')
        errors = [l for l in k.logs if 'POPUP' in l and 'Failed to load resource' not in l]
        check(not errors, f'nessun errore nella pagina {errors[:2]}')

        print('Impostazione: parti anche con il browser ridotto a icona')
        await pg.click('.nav button[data-section="playback"]')
        check(await pg.is_checked('input[data-setting="backgroundStart"]'), 'attiva di serie')
        await pg.click('input[data-setting="backgroundStart"]', force=True)
        await asyncio.sleep(0.3)
        check((await k.get('backgroundStart'))['backgroundStart'] is False, 'si può spegnere')


asyncio.run(main())
print('OK test_links')
