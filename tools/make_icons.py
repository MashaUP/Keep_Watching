"""Rigenera le icone dell'estensione in icons/ (16, 32, 48, 128 px).

Uso:  python tools/make_icons.py      (richiede Pillow: pip install pillow)

Disegno: quadrato arrotondato scuro con il simbolo "prossimo" (triangolo + barra)
nel verde del player del sito (#19AD79).
"""
from pathlib import Path
from PIL import Image, ImageDraw

GREEN = (25, 173, 121, 255)
BACKGROUND = (22, 26, 31, 255)
SIZES = (16, 32, 48, 128)
S = 1024  # si disegna in grande e si riduce, per bordi puliti

out_dir = Path(__file__).resolve().parent.parent / "icons"
out_dir.mkdir(exist_ok=True)

im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BACKGROUND)

h = S * 0.46                 # altezza del simbolo
tri_w = h * 0.86             # larghezza del triangolo
bar_w = S * 0.095            # larghezza della barra
gap = S * 0.045              # spazio tra triangolo e barra
x0 = S / 2 - (tri_w + gap + bar_w) / 2 + S * 0.02  # leggero spostamento ottico a destra
y0 = S / 2 - h / 2

d.polygon([(x0, y0), (x0 + tri_w, S / 2), (x0, y0 + h)], fill=GREEN)
bx = x0 + tri_w + gap
d.rounded_rectangle([bx, y0, bx + bar_w, y0 + h], radius=int(bar_w * 0.3), fill=GREEN)

for size in SIZES:
    im.resize((size, size), Image.LANCZOS).save(out_dir / f"icon{size}.png")
    print(f"icons/icon{size}.png")
