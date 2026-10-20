"""
Menu dell'estensione: impostazioni, popup per categoria, aspetto, profili, statistiche
(grafico, esportazione, importazione, azzeramento), centro aggiornamenti con GitHub finto,
novità, verifica dell'installazione, Ko-fi.

Avvio: python3 server.py &  poi  xvfb-run -a python3 test_popup.py
"""
import asyncio, datetime, json, os, tempfile, time
from kw import KW, check

REPO = 'MashaUP/Keep_Watching'
# Versione installata (dal manifest) e una versione "precedente" per gli scenari.
CUR = json.load(open(os.path.join(os.path.dirname(__file__), '..', '..', 'manifest.json'), encoding='utf-8'))['version']
OLD = '1.3.0'


def rel(tag, body='### Aggiunto\n- Nuova funzione\n### Corretto\n- Un bug', pre=False, asset=True):
    v = tag.lstrip('v')
    return {'tag_name': tag, 'name': tag, 'prerelease': pre, 'draft': False, 'published_at': '2026-10-20T10:00:00Z', 'body': body,
            'html_url': f'https://github.com/{REPO}/releases/tag/{tag}',
            'assets': [{'name': f'Keep_Watching-{v}.zip', 'size': 40000,
                        'browser_download_url': f'https://github.com/{REPO}/releases/download/{tag}/Keep_Watching-{v}.zip'}] if asset else []}


def seeded_stats():
    now = int(time.time() * 1000)
    days = {}
    for i in range(10):
        d = (datetime.date.today() - datetime.timedelta(days=i)).isoformat()
        days[d] = {'play': 1800 + i * 60, 'sessions': 1, 'completed': 1, 'intro': 1, 'credits': 0, 'est': False}
    return {'schema': 1, 'days': days, 'sessions': [{'start': now - 86400000 * i, 'end': now - 86400000 * i + 1800000, 'play': 1800} for i in range(1, 10)],
            'session': None, 'recent': []}


async def text(pg, sel):
    return (await pg.text_content(sel) or '').strip()


async def visible(pg, sel):
    return await pg.is_visible(sel)


async def fresh_check(k, pg, routes):
    """Nuove risposte di GitHub e controllo automatico all'apertura (come il primo del giorno)."""
    k.github = routes
    await k.set({'updateCheck': None})
    await pg.reload()
    await pg.click('.nav button[data-section="updates"]')
    for _ in range(40):
        st = await text(pg, '#uStatus')
        if st and 'in corso' not in st and 'Non hai ancora' not in st:
            break
        await asyncio.sleep(0.1)
    return await text(pg, '#uStatus')


async def main():
    async with KW(quiet=True) as k:
        k.github = {'/releases?per_page=15': (200, [rel('v' + CUR)])}
        await k.set({'stats': seeded_stats(), 'whatsNew': {'version': CUR, 'from': OLD, 'at': int(time.time() * 1000)}})
        pg = await k.popup()

        print('Panoramica e novità')
        check(await text(pg, '#version') == 'v' + CUR, 'versione mostrata nel menu')
        check(await visible(pg, '#whatsNew') and OLD in await text(pg, '#whatsNewTitle'), 'novità della versione installata mostrate dopo l\'aggiornamento')
        items = await pg.eval_on_selector_all('#whatsNewList li', 'l => l.map(x => x.textContent)')
        check(len(items) >= 1 and all(len(i) < 90 for i in items), f'novità lette dal CHANGELOG locale, solo i titoli ({items})')
        await pg.click('#whatsNewClose')
        await asyncio.sleep(0.3)
        check(not await visible(pg, '#whatsNew') and (await k.get('whatsNew')).get('whatsNew') is None, 'novità chiuse: non ricompaiono')
        check('Alt+Shift+K' in await text(pg, '#shortcutHint'), 'scorciatoia di attivazione mostrata')
        kofi = await pg.eval_on_selector_all('[data-kofi-link]', 'l => l.map(a => [a.href, a.target, a.rel, a.hidden])')
        check(all(a[0] == 'https://ko-fi.com/mashaup' and a[1] == '_blank' and 'noopener' in a[2] and not a[3] for a in kofi) and len(kofi) == 2,
              'link Ko-fi corretti, in nuova scheda, senza referrer (panoramica e Sostieni)')

        print('Migrazione dalla 1.4.0')
        await k.sw.evaluate("chrome.storage.local.remove('toolbar').then(() => chrome.storage.local.set({ uiMinimal: true })).then(() => migrateSettings())")
        st = await k.get(['toolbar', 'uiMinimal', 'settingsSchema'])
        check(st['toolbar'] == {'skipIntro': True, 'quick': True, 'setIntro': False, 'setCredits': False, 'stopAtEnd': False, 'help': False}
              and 'uiMinimal' not in st and st['settingsSchema'] == 3, f'modalità minimale convertita nella scelta dei pulsanti: {st}')
        await k.set({'toolbar': {'skipIntro': True, 'quick': True, 'setIntro': True, 'setCredits': True, 'stopAtEnd': True, 'help': True}})

        print('Impostazioni')
        await pg.click('.nav button[data-section="playback"]')
        await pg.evaluate("document.querySelector('section[data-section=\"playback\"] input[data-setting=\"autoNext\"]').click()")
        await asyncio.sleep(0.2)
        check((await k.get('autoNext'))['autoNext'] is False, 'interruttore salvato (prossimo episodio automatico)')
        await pg.evaluate("document.querySelector('section[data-section=\"playback\"] input[data-setting=\"autoNext\"]').click()")
        await pg.click('.seg[data-setting="quickSkip"] button[data-value="30"]')
        await pg.select_option('#countdown', '15')
        await asyncio.sleep(0.3)
        st = await k.get(['quickSkip', 'countdown', 'autoNext'])
        check(st == {'quickSkip': 30, 'countdown': 15, 'autoNext': True}, f'salto 30 s e conto 15 s salvati come numeri: {st}')
        check(await pg.get_attribute('.seg[data-setting="quickSkip"] button[data-value="30"]', 'aria-checked') == 'true', 'scelta del salto evidenziata')
        sc = await pg.eval_on_selector_all('#shortcutList kbd', 'l => l.map(x => x.textContent)')
        check('Alt+Shift+→' in sc and 'Alt+Shift+K' in sc, f'scorciatoie leggibili: {sc[:4]}')
        await pg.click('section[data-section="playback"] [data-show-guide]')
        await asyncio.sleep(0.4)
        check('Nessun player' in await text(pg, 'section[data-section="playback"] [data-guide-result]'), 'guida senza player: spiega cosa fare')

        print('Popup sul video e aspetto')
        await pg.click('.nav button[data-section="ui"]')
        await pg.click('input[data-popup="info"]', force=True)
        await asyncio.sleep(0.2)
        pops = (await k.get('popups'))['popups']
        check(pops['info'] is False and pops['countdown'] is True and len(pops) == 6, 'categoria spenta, le altre invariate')
        await pg.evaluate("document.querySelector('input[data-setting=\"popupsHidden\"]').click()")
        await asyncio.sleep(0.3)
        dis = await pg.eval_on_selector_all('input[data-popup]', 'l => l.every(x => x.disabled)')
        st = await k.get(['popupsHidden', 'popups'])
        check(dis and st['popupsHidden'] and st['popups']['info'] is False and st['popups']['countdown'], 'tutti nascosti: categorie bloccate ma scelte conservate')
        await pg.evaluate("document.querySelector('input[data-setting=\"popupsHidden\"]').click()")

        await pg.click('.seg[data-setting="uiSize"] button[data-value="large"]')
        await pg.click('.seg[data-setting="uiPosition"] button[data-value="top-left"]')
        await pg.evaluate("(() => { const r = document.getElementById('uiOpacity'); r.value = 55; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); })()")
        await pg.click('input[data-toolbar="help"]', force=True)
        await pg.click('input[data-toolbar="stopAtEnd"]', force=True)
        await asyncio.sleep(0.3)
        st = await k.get(['uiSize', 'uiPosition', 'uiOpacity', 'toolbar'])
        check(st['toolbar'] == {'skipIntro': True, 'quick': True, 'setIntro': True, 'setCredits': True, 'stopAtEnd': False, 'help': False}, f'pulsanti scelti uno per uno: {st["toolbar"]}')
        check({k2: st[k2] for k2 in ('uiSize', 'uiPosition', 'uiOpacity')} == {'uiSize': 'large', 'uiPosition': 'top-left', 'uiOpacity': 55}, f'aspetto salvato: {st}')
        check(await text(pg, '[data-toolbar-label="quick"]') == 'Salto avanti (+30 s)', 'etichetta del salto con la durata scelta')
        await pg.click('#toolbarMinimal')
        await asyncio.sleep(0.3)
        tb = (await k.get('toolbar'))['toolbar']
        check({i for i, v in tb.items() if v} == {'skipIntro', 'quick'}, f'"Solo Salta intro e salto avanti": {tb}')
        await pg.evaluate("document.querySelectorAll('input[data-toolbar]').forEach(i => { if (i.checked) i.click(); })")
        await asyncio.sleep(0.4)
        check(await visible(pg, '#pvEmpty') and not await visible(pg, '#pvBar'), 'nessun pulsante: l\'anteprima lo dice')
        await pg.click('#toolbarAll')
        await asyncio.sleep(0.3)
        check(all((await k.get('toolbar'))['toolbar'].values()), '"Tutti" rimette ogni pulsante')
        await pg.click('#toolbarMinimal')
        await asyncio.sleep(0.3)
        pv = await pg.evaluate("(() => { const b = document.getElementById('pvBar'); return [b.style.getPropertyValue('--pv-scale'), b.style.getPropertyValue('--pv-alpha'), document.getElementById('pvVideo').classList.contains('left'), [...b.querySelectorAll('.pv-btn')].map(x => x.hidden ? '-' : x.textContent)] })()")
        check(pv[0] == '1.2' and pv[1] == '0.55' and pv[2] and pv[3] == ['Salta intro', '+30 s', '-', '-', '-', '-'], f'anteprima aggiornata: {pv}')
        await pg.click('#resetLook')
        await asyncio.sleep(0.3)
        st = await k.get(['uiSize', 'uiPosition', 'uiOpacity', 'toolbar', 'quickSkip', 'countdown', 'popups'])
        check(st['uiSize'] == 'standard' and st['uiPosition'] == 'top-right' and st['uiOpacity'] == 82 and all(st['toolbar'].values())
              and st['quickSkip'] == 30 and st['countdown'] == 15 and st['popups']['info'] is False,
              'Ripristina aspetto: solo l\'aspetto, non salto, conto alla rovescia e popup')
        await k.set({'countdown': 10, 'popups': {**st['popups'], 'info': True}})

        print('Profili')
        await pg.click('.nav button[data-section="profiles"]')
        check(not await visible(pg, '#profileCustom'), 'profilo Normale non personalizzato')
        await pg.click('.profile[data-profile="night"]')
        await asyncio.sleep(0.3)
        st = await k.get(['profile', 'popups', 'sleepFade', 'autoNext', 'quickSkip', 'sleep'])
        check(st['profile'] == 'night' and st['popups']['confirm'] is False and st['popups']['countdown'] is True and st['sleepFade'] and st['quickSkip'] == 30,
              'Notturno applicato subito; salto avanti non toccato')
        check(not st.get('sleep'), 'il profilo non avvia nessun timer')
        check(await pg.get_attribute('.profile[data-profile="night"]', 'aria-checked') == 'true' and not await visible(pg, '#profileCustom'), 'Notturno attivo, non personalizzato')
        await k.set({'countdown': 20})
        await asyncio.sleep(0.4)
        check(await visible(pg, '#profileCustom') and 'conto alla rovescia' in await text(pg, '#profileCustomText'), 'modifica manuale → "Personalizzato" con il dettaglio')
        await asyncio.sleep(0.5)
        check((await k.get('countdown'))['countdown'] == 20, 'il profilo non sovrascrive la modifica manuale')
        await pg.click('#profileRestore')
        await asyncio.sleep(0.3)
        check((await k.get('countdown'))['countdown'] == 10 and not await visible(pg, '#profileCustom'), 'Ripristina il profilo')
        await pg.click('.nav button[data-section="overview"]')
        check(await visible(pg, '#nightTimer'), 'Notturno: timer di spegnimento in primo piano nella panoramica')
        await pg.select_option('#nightTimer select[data-sleep]', '30')
        await asyncio.sleep(0.3)
        sl = (await k.get('sleep'))['sleep']
        check(sl['mode'] == 'time' and sl['minutes'] == 30, 'timer impostato dalla panoramica')
        check('Alle' in await text(pg, '#stSleep'), 'tessera del timer con l\'orario')
        await k.set({'sleep': {'mode': 'off'}})
        await pg.click('.nav button[data-section="profiles"]')
        await pg.click('.profile[data-profile="manual"]')
        await asyncio.sleep(0.3)
        check((await k.get('autoNext'))['autoNext'] is False, 'Manuale: niente cambio automatico')
        await pg.click('.profile[data-profile="normal"]')
        await asyncio.sleep(0.3)
        st = await k.get(['autoNext', 'popups', 'profile'])
        check(st['autoNext'] and all(st['popups'].values()) and st['profile'] == 'normal', 'Normale ripristina le impostazioni di serie')

        print('Statistiche')
        await pg.click('.nav button[data-section="stats"]')
        check(await text(pg, '#sSessions') == '7' and await text(pg, '#sCompleted') == '7', 'riepilogo 7 giorni')
        await pg.click('#statsRange button[data-value="30"]')
        check(await text(pg, '#sSessions') == '10' and '30' in await text(pg, '#chartTitle'), 'riepilogo 30 giorni')
        bars = await pg.eval_on_selector_all('#chart path.bar', 'l => l.length')
        rows = await pg.eval_on_selector_all('#chartTable tbody tr', 'l => l.length')
        check(bars == 10 and rows == 30, f'grafico con 10 colonne e tabella di 30 giorni ({bars}, {rows})')
        await pg.click('#statsRange button[data-value="today"]')
        check(await text(pg, '#sSessions') == '1', 'riepilogo di oggi')
        await pg.hover('#chart .col >> nth=6')
        check(not await pg.is_hidden('#tooltip') and 'di visione' in await text(pg, '#tooltip'), 'suggerimento al passaggio del mouse')

        async with pg.expect_download() as d:
            await pg.click('#exportCsv')
        dl = await d.value
        csv = open(await dl.path(), encoding='utf-8-sig').read().splitlines()
        check(dl.suggested_filename.startswith('keep-watching-statistiche-') and dl.suggested_filename.endswith('.csv'), f'nome del file CSV: {dl.suggested_filename}')
        check(csv[0].startswith('data;tempo_visione_secondi') and len(csv) == 11, f'CSV con intestazione e 10 giorni ({len(csv)} righe)')
        async with pg.expect_download() as d:
            await pg.click('#exportJson')
        dl = await d.value
        exported = json.load(open(await dl.path(), encoding='utf-8'))
        check(exported['schema'] == 'keep-watching-stats' and exported['extensionVersion'] == CUR and len(exported['days']) == 10, 'JSON con formato, versione e 10 giorni')
        check(not any('title' in json.dumps(x).lower() for x in exported['days']), 'nessun titolo nel file esportato')

        # Importazione (in scheda: dal popup il selettore di file lo chiuderebbe).
        check(await visible(pg, '#importInTab') and not await visible(pg, '#importLabel'), 'nel popup: importazione da una scheda')
        tab = await k.popup(query='?tab=1#stats')
        check(await tab.evaluate("document.body.classList.contains('tab')") and await visible(tab, '#importLabel'), 'in scheda: scelta del file disponibile')
        tmp = tempfile.mkdtemp()
        bad = os.path.join(tmp, 'bad.json')
        open(bad, 'w').write('{"schema":"altro"}')
        await tab.set_input_files('#importFile', bad)
        await asyncio.sleep(0.3)
        check('non importato' in await text(tab, '#importResult'), f'file non valido rifiutato: {await text(tab, "#importResult")}')
        good = os.path.join(tmp, 'stats.json')
        json.dump(exported, open(good, 'w'))
        await tab.set_input_files('#importFile', good)
        await asyncio.sleep(0.5)
        check('0 giorni aggiunti' in await text(tab, '#importResult'), f'reimportare lo stesso file non duplica: {await text(tab, "#importResult")}')
        check((await k.get('stats'))['stats']['days'][datetime.date.today().isoformat()]['sessions'] == 1, 'valori invariati dopo la reimportazione')
        await tab.click('#importMode button[data-value="replace"]')
        old = datetime.date.today() - datetime.timedelta(days=50)
        exported['days'] = [{'date': old.isoformat(), 'play': 600, 'sessions': 1, 'completed': 0, 'intro': 0, 'credits': 0, 'estimated': False}]
        exported['sessions'] = []
        json.dump(exported, open(good, 'w'))
        await tab.set_input_files('#importFile', good)
        await asyncio.sleep(0.3)
        check(await visible(tab, '#importConfirm'), 'Sostituisci chiede conferma')
        await tab.click('#importCancel')
        check(len((await k.get('stats'))['stats']['days']) == 10, 'annullato: storico intatto')
        await tab.set_input_files('#importFile', good)
        await asyncio.sleep(0.3)
        await tab.click('#importGo')
        await asyncio.sleep(0.5)
        days = (await k.get('stats'))['stats']['days']
        check(list(days) == [old.isoformat()], 'confermato: storico sostituito')
        await tab.close()

        await asyncio.sleep(0.3)
        await pg.click('#statsRange button[data-value="7"]')
        check(await visible(pg, '#chart .chart-empty'), 'nessun dato negli ultimi 7 giorni: messaggio al posto del grafico')
        await pg.click('#resetStats')
        check(await visible(pg, '#resetConfirm'), 'azzeramento: chiede conferma')
        await pg.click('#resetGo')
        await asyncio.sleep(0.4)
        st = (await k.get('stats'))['stats']
        check(not st['days'] and 'azzerate' in await text(pg, '#resetResult'), 'statistiche azzerate')
        check((await k.get('quickSkip'))['quickSkip'] == 30, 'azzerare le statistiche non tocca le impostazioni')

        print('Aggiornamenti (GitHub finto)')
        st = await fresh_check(k, pg, {'/releases?per_page=15': (200, [rel('v' + CUR), rel('v' + OLD)])})
        check('Sei aggiornato' in st and await pg.is_disabled('#updateAction') and await text(pg, '#uLatest') == CUR, 'stessa versione: "Sei aggiornato"')
        check(len(await pg.eval_on_selector_all('#historyList .history-item', 'l => l')) == 2, 'registro delle versioni dalle release')

        st = await fresh_check(k, pg, {'/releases?per_page=15': (200, [rel('v9.1.0-beta.1', pre=True), rel('v9.0.0'), rel('v' + CUR)])})
        check('9.0.0' in st and await text(pg, '#updateAction') == 'Scarica aggiornamento', 'versione più recente: "Scarica aggiornamento"')
        check(await visible(pg, '#uPrerelease') and '9.1.0-beta.1' in await text(pg, '#uPrerelease'), 'versione di prova segnalata ma non proposta')
        check(await visible(pg, '#navUpdateDot') is False, 'aperta la sezione: indicatore sul menu spento')
        async with k.ctx.expect_page() as newp:
            await pg.click('#updateAction')
        p2 = await newp.value
        await asyncio.sleep(0.3)
        check('releases/download/v9.0.0/Keep_Watching-9.0.0.zip' in p2.url, f'download dallo zip della release ufficiale')
        await p2.close()
        page_text = await text(pg, 'section[data-section="updates"]')
        check('installat' not in (await text(pg, '#uStatus')).lower() and not await visible(pg, '#installBanner') and (await k.get('reloadRequest')).get('reloadRequest') is None,
              'dopo il download non dice "installato"')
        check(await visible(pg, '#installSteps'), 'istruzioni per installare lo zip')

        st = await fresh_check(k, pg, {'/releases?per_page=15': (200, [rel('v9.0.0', body='', asset=False)])})
        check(await text(pg, '#updateAction') == 'Apri la pagina su GitHub' and 'non ha note' in await text(pg, '#uNotes'), 'release senza zip né note: pagina della release')

        st = await fresh_check(k, pg, {'/releases?per_page=15': (200, [rel('v' + OLD)])})
        check('più recente' in st, f'versione installata più nuova di quella pubblicata: {st}')

        changelog = open(os.path.join(os.path.dirname(__file__), '..', '..', 'CHANGELOG.md'), encoding='utf-8').read().replace(f'## [{CUR}]', f'## [9.9.1] - 2026-10-30\n\n### Corretto\n- Prova\n\n## [{CUR}]')
        st = await fresh_check(k, pg, {
            '/releases?per_page=15': (200, []),
            'contents/version.json': (200, {'version': '9.9.1', 'date': '2026-10-30', 'zip': 'Keep_Watching-9.9.1.zip'}),
            'contents/CHANGELOG.md': (200, changelog),
            'contents/': (200, [{'type': 'file', 'name': 'Keep_Watching-9.9.1.zip', 'size': 1, 'download_url': f'https://raw.githubusercontent.com/{REPO}/main/Keep_Watching-9.9.1.zip'}])})
        check('9.9.1' in st and await text(pg, '#updateAction') == 'Scarica aggiornamento' and 'version.json' in await text(pg, '#uSource'), 'senza release: version.json e zip nel repository')
        check('Prova' in await text(pg, '#uNotes'), 'note prese dal CHANGELOG del repository')

        st = await fresh_check(k, pg, {'/releases?per_page=15': (200, [])})
        check('né release né version.json' in st, 'nessuna versione pubblicata: messaggio chiaro')
        st = await fresh_check(k, pg, {'/releases?per_page=15': (404, {'message': 'Not Found'})})
        check('non trovato o privato' in st, 'repository privato o inesistente')
        st = await fresh_check(k, pg, {'/releases?per_page=15': 'abort'})
        check('non è raggiungibile' in st, 'rete assente')
        reset = int(time.time()) + 1800
        st = await fresh_check(k, pg, {'/releases?per_page=15': (403, {'message': 'API rate limit exceeded'}, {'x-ratelimit-remaining': '0', 'x-ratelimit-reset': str(reset)})})
        check('limite di richieste' in st, 'limite di richieste di GitHub')
        calls = len(k.github_calls)
        await pg.click('#checkUpdate')
        await asyncio.sleep(0.3)
        check(len(k.github_calls) == calls and 'di nuovo richieste dalle' in await text(pg, '#uStatus'), 'durante il blocco nessuna nuova richiesta, con l\'orario')

        k.github = {'/releases?per_page=15': (200, [rel('v' + CUR)])}
        await k.set({'updateCheck': {**(await k.get('updateCheck'))['updateCheck'], 'rateLimitReset': None, 'at': int(time.time() * 1000) - 120000}})
        await asyncio.sleep(0.2)
        await pg.click('#checkUpdate')
        await asyncio.sleep(0.6)
        check('Sei aggiornato' in await text(pg, '#uStatus') and 'non riuscito' not in await text(pg, '#uLastCheck'), 'controllo manuale riuscito')
        calls = len(k.github_calls)
        await pg.click('#checkUpdate')
        await asyncio.sleep(0.3)
        check(len(k.github_calls) == calls and 'meno di un minuto' in await text(pg, '#uStatus'), 'secondo clic entro un minuto: nessuna richiesta')
        await pg.reload()
        await asyncio.sleep(0.5)
        check(len(k.github_calls) == calls, 'riaprendo il menu nessun controllo automatico (già fatto oggi)')
        await k.set({'updateAutoCheck': False, 'updateCheck': None})
        await pg.reload()
        await asyncio.sleep(0.5)
        check(len(k.github_calls) == calls, 'controllo automatico disattivato: nessuna richiesta')

        print('Verifica dopo la ricarica')
        await k.set({'reloadRequest': {'from': OLD, 'at': int(time.time() * 1000)}})
        await pg.click('.nav button[data-section="overview"]')
        await asyncio.sleep(0.3)
        check(f'ora hai la {CUR}' in await text(pg, '#installTitle'), 'versione cambiata: installazione confermata')
        await k.set({'reloadRequest': {'from': CUR, 'at': int(time.time() * 1000)}})
        await asyncio.sleep(0.3)
        check(f'ancora la {CUR}' in await text(pg, '#installTitle'), 'stessa versione: non dichiara installato, spiega cosa fare')
        await pg.click('#installClose')
        await asyncio.sleep(0.3)
        check(not await visible(pg, '#installBanner'), 'avviso chiuso')

        # chrome.runtime.reload() non si prova qui: in Chromium avviato da Playwright con
        # --load-extension l'estensione ricaricata non torna disponibile. Va provato a mano in Brave.

        # Le risposte 404/403 e la rete assente simulate sopra compaiono come "Failed to load resource".
        errors = [l for l in k.logs if 'POPUP' in l and 'Failed to load resource' not in l]
        check(not errors, f'nessun errore nella pagina del menu {errors[:3]}')


asyncio.run(main())
print('OK test_popup')
