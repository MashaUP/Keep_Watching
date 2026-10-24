"""Rigenera le icone dell'estensione in icons/ (16, 32, 48, 128 px).

Uso:  python tools/make_icons.py      (richiede Pillow: pip install pillow)

Disegno (dalla 1.5.0): quadrato arrotondato scuro, anello sfumato dal viola all'azzurro
aperto in alto a destra, con una freccia che riparte verso l'alto ("si continua"), e un
triangolo di play bianco al centro. Le dimensioni piccole hanno tratti più spessi e una
freccia più grande, perché a 16 px i dettagli sottili spariscono.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

S = 1024                      # si disegna in grande e si riduce, per bordi puliti
OUT = Path(__file__).resolve().parent.parent / "icons"

BG_TOP = (36, 37, 58)
BG_BOTTOM = (16, 17, 27)
BORDER = (255, 255, 255, 22)
# Colori lungo l'anello, dall'inizio (in alto) alla fine (a destra, dove c'è la freccia).
STOPS = [(0.0, (199, 143, 247)), (0.35, (150, 120, 246)), (0.7, (83, 150, 247)), (1.0, (64, 182, 248))]
ARROW = (142, 152, 248)
PLAY = (247, 247, 252)

# Varianti: spessore e raggio dell'anello, scala del play e della freccia (frazioni di S),
# centro dell'anello e sfondo.
#   large   — 48 e 128 px (pagina delle estensioni, menu): quadrato scuro arrotondato.
#   toolbar — 16 e 32 px (barra del browser): niente quadrato, l'anello occupa tutta
#             l'icona e un disco scuro dentro l'anello tiene leggibile il play bianco anche
#             sulle barre chiare. Così l'icona appare grande quanto quelle delle altre estensioni.
VARIANTS = {
    "large": dict(stroke=0.115, radius=0.34, play=1.3, arrow=0.95, cx=0.47, cy=0.535, square=True),
    "toolbar": dict(stroke=0.19, radius=0.355, play=1.62, arrow=0.72, cx=0.465, cy=0.53, square=False),
}
DISK = (24, 25, 40)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def color_at(t):
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        if t <= t1:
            return lerp(c0, c1, (t - t0) / (t1 - t0))
    return STOPS[-1][1]


def background():
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        gd.line([(0, y), (S, y)], fill=lerp(BG_TOP, BG_BOTTOM, y / (S - 1)) + (255,))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.23), fill=255)
    im.paste(grad, (0, 0), mask)
    ImageDraw.Draw(im).rounded_rectangle([3, 3, S - 4, S - 4], radius=int(S * 0.225), outline=BORDER, width=6)
    return im


def draw(variant):
    v = VARIANTS[variant]
    stroke, radius, play_k, arrow_k = v["stroke"], v["radius"], v["play"], v["arrow"]
    im = background() if v["square"] else Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(ring)
    cx, cy = S * v["cx"], S * v["cy"]
    r = S * radius
    w = S * stroke
    if not v["square"]:
        inner = r - w / 2 + 2
        ImageDraw.Draw(im).ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=DISK + (255,))

    # Anello: da 290° (in alto, appena a destra) scendendo a sinistra, in basso e risalendo a
    # destra fino a -12°. Angoli in coordinate dello schermo (y verso il basso).
    start, end = 290.0, -12.0
    steps = 900
    for i in range(steps + 1):
        t = i / steps
        a = math.radians(start + (end - start) * t)
        x, y = cx + r * math.cos(a), cy + r * math.sin(a)
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=color_at(t) + (255,))

    # Freccia alla fine dell'anello, nel verso in cui l'anello prosegue (verso l'alto).
    a = math.radians(end)
    ex, ey = cx + r * math.cos(a), cy + r * math.sin(a)
    tx, ty = math.sin(a), -math.cos(a)          # tangente nel verso degli angoli decrescenti
    # Leggera rotazione verso destra, come nel disegno di riferimento.
    rot = math.radians(18)
    tx, ty = tx * math.cos(rot) - ty * math.sin(rot), tx * math.sin(rot) + ty * math.cos(rot)
    nx, ny = -ty, tx
    head_len = w * 1.55 * arrow_k
    head_w = w * 1.25 * arrow_k
    base_x, base_y = ex - tx * w * 0.15, ey - ty * w * 0.15
    tip = (base_x + tx * head_len, base_y + ty * head_len)
    left = (base_x + nx * head_w, base_y + ny * head_w)
    right = (base_x - nx * head_w, base_y - ny * head_w)
    d.polygon([tip, left, right], fill=ARROW + (255,))

    # Leggero bagliore sotto l'anello.
    glow = ring.filter(ImageFilter.GaussianBlur(S * 0.03))
    glow.putalpha(glow.getchannel("A").point(lambda v: int(v * 0.35)))
    im.alpha_composite(glow)
    im.alpha_composite(ring)

    # Play bianco con gli angoli arrotondati: il triangolo viene sfocato e ritagliato a metà,
    # che arrotonda le punte senza allargarle.
    h = S * 0.25 * play_k
    tw = h * 0.92
    px = cx - tw * 0.36
    tri = [(px, cy - h / 2), (px + tw, cy), (px, cy + h / 2)]
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).polygon(tri, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(S * 0.018 * play_k)).point(lambda v: 255 if v > 118 else 0)
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    white = Image.new("RGBA", (S, S), PLAY + (255,))
    im.paste(white, (0, 0), mask)
    return im


def main():
    OUT.mkdir(exist_ok=True)
    big, small = draw("large"), draw("toolbar")
    for size in (16, 32, 48, 128):
        src = small if size <= 32 else big
        src.resize((size, size), Image.LANCZOS).save(OUT / f"icon{size}.png")
        print(f"icons/icon{size}.png")
    big.resize((512, 512), Image.LANCZOS).save(OUT.parent / "docs" / "icona.png")
    print("docs/icona.png")


if __name__ == "__main__":
    main()
