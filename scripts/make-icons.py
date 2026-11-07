"""Generate Simple Bill PWA icons with Pillow (original artwork, no brand assets).
Teal rounded square, white receipt glyph with a rupee mark. Maskable version
adds safe padding so nothing important sits near the edge."""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)

def draw(size, pad, path):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Rounded background
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=size * 0.22, fill=(15, 118, 110, 255))
    # Receipt sheet
    x0, y0 = size * 0.30, size * 0.20
    x1, y1 = size * 0.70, size * 0.80
    d.rounded_rectangle([x0, y0, x1, y1], radius=size * 0.03, fill=(255, 255, 255, 255))
    # Rupee mark (drawn as text with a fallback glyph)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', int(size * 0.30))
    except Exception:
        font = ImageFont.load_default()
    d.text((size / 2, size * 0.42), '\u20B9', fill=(15, 118, 110, 255), font=font, anchor='mm')
    # Receipt lines
    for i, w in enumerate((0.22, 0.22, 0.14)):
        yy = size * (0.62 + i * 0.07)
        d.line([size * 0.36, yy, size * 0.36 + size * w, yy], fill=(15, 118, 110, 255), width=max(3, size // 90))
    img.save(path, 'PNG')
    print(path, size)

draw(192, 0, os.path.join(OUT, 'icon-192.png'))
draw(512, 0, os.path.join(OUT, 'icon-512.png'))
draw(512, 52, os.path.join(OUT, 'maskable-512.png'))
