"""Guida alle scorciatoie e aspetto della barra sul player."""
import asyncio
from kw import KW, check


async def main():
    async with KW(quiet=True) as k:
        await k.set({'countdown': 0, 'autoNext': False})
        await k.open()
        await asyncio.sleep(1)

        print('— guida alle scorciatoie')
        res = await k.command('show-shortcuts')
        await asyncio.sleep(0.4)
        g = await k.guide()
        check(res == 'sent' and g and len(g) == 7, f'guida aperta con i 7 comandi dell\'estensione ({len(g or [])})')
        for row in g:
            print('     ', row)
        check(any(r.startswith('Attiva o sospendi Keep_Watching = Alt+Shift+K → Attiva') for r in g), 'Alt+Shift+K invariata e attiva')
        check(any(r.startswith('Salta intro') and 'intro non segnata' in r for r in g), 'Salta intro segnalata come non disponibile senza intro segnata')
        check(any(r.startswith('Segna l\'inizio dei titoli = Non assegnata') for r in g), 'comandi senza tasti indicati come non assegnati')
        await k.player().evaluate("document.body.focus()")
        await k.player().press('body', 'Escape')
        await asyncio.sleep(0.3)
        check(await k.guide() is None, 'Esc nel player chiude la guida')

        await k.command('show-shortcuts')
        await asyncio.sleep(0.3)
        await k.page.press('#search', 'Escape')
        await asyncio.sleep(0.5)
        check(await k.guide() is None, 'Esc sulla pagina del sito chiude la guida')
        await k.page.evaluate("document.activeElement.blur()")

        await k.click_toolbar('?')
        await asyncio.sleep(0.5)
        check(await k.guide() is not None, 'il pulsante "?" della barra apre la guida')
        await k.player().evaluate("""document.querySelector('[data-kw="guide"]').shadowRoot.querySelector('[data-a="close"]').click()""")
        await asyncio.sleep(0.2)
        check(await k.guide() is None, 'il pulsante Chiudi chiude la guida')

        await k.set({'guideAutoClose': 10})
        await k.command('show-shortcuts')
        await asyncio.sleep(0.4)
        check(await k.guide() is not None, 'guida aperta prima della chiusura automatica')
        await asyncio.sleep(10.2)
        check(await k.guide() is None, 'chiusura automatica dopo 10 s')
        await k.set({'guideAutoClose': 0})

        await k.set({'popupsHidden': True})
        await k.command('show-shortcuts')
        await asyncio.sleep(0.3)
        check(await k.guide() is not None, 'la guida si apre anche con i popup nascosti (l\'hai chiesta tu)')
        await k.command('show-shortcuts')
        await k.set({'popupsHidden': False})

        print('— aspetto della barra')
        st = await k.toolbar_style()
        await k.toolbar()
        st = await k.toolbar_style()
        check(st['align'] == 'right' and st['right'] < 40, f'posizione di serie: in alto a destra {st}')
        check(st['bg'].startswith('rgba(13, 16, 21, 0.82'), f'opacità di serie 82% ({st["bg"]})')
        base_font = float(st['font'].replace('px', ''))

        await k.set({'uiSize': 'large', 'uiDensity': 'spaced', 'uiOpacity': 50, 'uiPosition': 'top-left', 'uiReduceMotion': True})
        await asyncio.sleep(0.4)
        await k.toolbar()
        st = await k.toolbar_style()
        check(float(st['font'].replace('px', '')) > base_font, f'dimensione Grande: testo più grande ({st["font"]} > {base_font}px)')
        check(st['gap'] == '12px', f'densità Spaziata: spazio 12px ({st["gap"]})')
        check(st['bg'].startswith('rgba(13, 16, 21, 0.5'), f'opacità 50% solo sullo sfondo ({st["bg"]})')
        check(st['color'] == 'rgb(238, 241, 245)', f'testo dei pulsanti non trasparente ({st["color"]})')
        check(st['align'] == 'left' and st['left'] < 40, f'posizione in alto a sinistra ({st["left"]})')
        check(st['reduce'], 'animazioni ridotte applicate')

        await k.set({'uiMinimal': True})
        await asyncio.sleep(0.3)
        bar = await k.toolbar()
        check(bar == ['+60 s'], f'modalità minimale: solo il salto ({bar})')

        await k.set({'uiMinimal': False, 'uiAutoHide': 0})
        await asyncio.sleep(0.3)
        await k.toolbar()
        await k.page.mouse.move(5, 5)
        await asyncio.sleep(4)
        check(await k.toolbar(hover=False) is not None, 'nascondimento automatico spento: la barra resta visibile')
        await k.set({'uiAutoHide': 3})
        await k.toolbar()
        await k.page.mouse.move(5, 5)
        await asyncio.sleep(3.6)
        check(await k.toolbar(hover=False) is None, 'nascondimento dopo 3 s senza movimento')

        await k.set({'uiPosition': 'top-center'})
        await k.toolbar()
        st = await k.toolbar_style()
        await k.command('quick-skip')
        await asyncio.sleep(0.2)
        top = await k.player().evaluate("""parseInt(document.querySelector('[data-kw="toast"]').style.top)""")
        check(st['align'] == 'center' and top > 60, f'barra al centro: l\'avviso scende sotto la barra (top {top}px)')


asyncio.run(main())
