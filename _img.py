# -*- coding: utf-8 -*-
"""Optimiza las fotos FLUX de img/ (redimensiona + JPEG q80, ~100-200 KB), crea og-home.jpg (1200x630)
   y favicon.ico desde el isotipo.   python _img.py
"""
import os, io
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(ROOT, 'img')
MAXW = {'hero': 1600, 'default': 1400, 'detail-parts': 1000, 'quote': 1000}


def optimise(name):
    src = os.path.join(IMG, name + '.jpg')
    if not os.path.exists(src):
        return
    im = Image.open(src).convert('RGB')
    mw = MAXW.get(name, MAXW['default'])
    if im.width > mw:
        im = im.resize((mw, round(im.height * mw / im.width)), Image.LANCZOS)
    # también una versión pequeña para móvil
    for suffix, w, q in (('', im.width, 80), ('-m', 800, 78)):
        out = os.path.join(IMG, name + suffix + '.jpg')
        i2 = im if w >= im.width else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        i2.save(out, 'JPEG', quality=q, optimize=True, progressive=True)
        print('  %-22s %4dx%-4d %4d KB' % (name + suffix + '.jpg', i2.width, i2.height, os.path.getsize(out) // 1024))


def og():
    src = os.path.join(IMG, 'hero.jpg')
    if not os.path.exists(src):
        return
    im = Image.open(src).convert('RGB')
    W, Hh = 1200, 630
    r = max(W / im.width, Hh / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x = (im.width - W) // 2
    y = (im.height - Hh) // 2
    im = im.crop((x, y, x + W, y + Hh))
    im.save(os.path.join(IMG, 'og-home.jpg'), 'JPEG', quality=82, optimize=True)
    print('  og-home.jpg 1200x630', os.path.getsize(os.path.join(IMG, 'og-home.jpg')) // 1024, 'KB')


def favicon():
    src = os.path.join(IMG, 'logo', 'wyelee-isotipo-color.png')
    im = Image.open(src).convert('RGBA')
    # cuadrado con margen
    s = max(im.width, im.height)
    sq = Image.new('RGBA', (int(s * 1.1), int(s * 1.1)), (0, 0, 0, 0))
    sq.paste(im, ((sq.width - im.width) // 2, (sq.height - im.height) // 2), im)
    sq.save(os.path.join(ROOT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
    sq.resize((180, 180), Image.LANCZOS).save(os.path.join(IMG, 'logo', 'apple-touch-icon.png'))
    print('  favicon.ico + apple-touch-icon.png')


if __name__ == '__main__':
    for f in sorted(os.listdir(IMG)):
        if f.endswith('.jpg') and not f.endswith('-m.jpg') and f != 'og-home.jpg':
            optimise(f[:-4])
    og()
    favicon()
