# -*- coding: utf-8 -*-
"""Genera el SVG isométrico "vista explotada" de una estantería 2x2 (estilo manual de armado).
   Cada pieza es un <g class="part"> con --dx/--dy (desplazamiento explotado en pantalla);
   el estado armado (.is-built) lleva transform:none.   python _hero_svg.py → _src/_hero-exploded.svg
"""
import io, os, math

ROOT = os.path.dirname(os.path.abspath(__file__))
U = 100.0                     # px por unidad
C30, S30 = math.cos(math.radians(30)), 0.5

W, D, Hh, T = 2.0, 0.42, 2.0, 0.07   # ancho (x), fondo (y), alto (z), grosor


def P(x, y, z):
    return ((x - y) * C30 * U, (x + y) * S30 * U - z * U)


def fmt(pt):
    return '%.1f,%.1f' % pt


class Box:
    def __init__(self, name, x0, x1, y0, y1, z0, z1, off=(0, 0, 0), num=None, label=None):
        self.name, self.x0, self.x1, self.y0, self.y1, self.z0, self.z1 = name, x0, x1, y0, y1, z0, z1
        self.off, self.num, self.label = off, num, label

    def faces(self):
        x0, x1, y0, y1, z0, z1 = self.x0, self.x1, self.y0, self.y1, self.z0, self.z1
        top = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]
        front = [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)]   # +y (izquierda en pantalla)
        right = [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)]   # +x (derecha en pantalla)
        return [('f-top', top), ('f-front', front), ('f-right', right)]

    def center(self):
        return P((self.x0 + self.x1) / 2, (self.y0 + self.y1) / 2, (self.z0 + self.z1) / 2)

    def behind(self, o):
        return self.x1 <= o.x0 + 1e-9 or self.y1 <= o.y0 + 1e-9 or self.z1 <= o.z0 + 1e-9


mid = W / 2
parts = [
    Box('back', T, W - T, 0.0, T, T, Hh - T, off=(0, -0.7, 0), num=1, label='Back panel'),
    Box('bottom', 0, W, 0.0, D, 0, T, off=(0, 0, -0.55), num=2, label='Base'),
    Box('left', 0, T, 0.0, D, T, Hh - T, off=(-0.6, 0, 0), num=3, label='Left side'),
    Box('divider', mid - T / 2, mid + T / 2, T, D, T, Hh - T, off=(0, 0.75, 0), num=4, label='Divider'),
    Box('shelf-l', T, mid - T / 2, T, D, Hh / 2 - T / 2, Hh / 2 + T / 2, off=(0, 0.5, 0), num=5, label='Shelf'),
    Box('shelf-r', mid + T / 2, W - T, T, D, Hh / 2 - T / 2, Hh / 2 + T / 2, off=(0, 0.5, 0)),
    Box('right', W - T, W, 0.0, D, T, Hh - T, off=(0.6, 0, 0), num=6, label='Right side'),
    Box('top', 0, W, 0.0, D, Hh - T, Hh, off=(0, 0, 0.6), num=7, label='Top'),
]

# orden de pintado: topológico con "behind"
order = []
rest = parts[:]
while rest:
    for b in rest:
        if all(b.behind(o) or not o.behind(b) for o in rest if o is not b):
            # b no está delante de nadie que quede por pintar
            pass
    # elegir el que no tenga a nadie "detrás" pendiente de pintar (todos los demás están delante o son independientes)
    pick = None
    for b in rest:
        if not any(o.behind(b) and not b.behind(o) for o in rest if o is not b):
            pick = b
            break
    if pick is None:
        pick = rest[0]
    order.append(pick)
    rest.remove(pick)

# límites (estado explotado y armado)
xs, ys = [], []
for b in parts:
    for _, poly in b.faces():
        for (px, py) in poly:
            xs.append(px); ys.append(py)
            ox, oy = P(*b.off)
            xs.append(px + ox); ys.append(py + oy)
M = 34
minx, maxx, miny, maxy = min(xs) - M, max(xs) + M, min(ys) - M, max(ys) + M
vb = '%.0f %.0f %.0f %.0f' % (minx, miny, maxx - minx, maxy - miny)

out = []
out.append('<svg class="xv" viewBox="%s" role="img" aria-labelledby="xv-title xv-desc" data-build="300">' % vb)
out.append('<title id="xv-title">Exploded view of a two-by-two cube shelf assembling itself</title>')
out.append('<desc id="xv-desc">Seven numbered panels — back, base, sides, divider, shelves and top — slide together into a finished cube shelf.</desc>')
# fantasma (silueta armada)
out.append('<g class="ghost">')
for b in order:
    for cls, poly in b.faces():
        out.append('<polygon points="%s"/>' % ' '.join(fmt(p) for p in poly))
out.append('</g>')
# piezas
delay = 0
for i, b in enumerate(order):
    ox, oy = P(*b.off)
    style = '--dx:%.1fpx;--dy:%.1fpx;--i:%d' % (ox, oy, parts.index(b))
    out.append('<g class="part p-%s" style="%s">' % (b.name, style))
    for cls, poly in b.faces():
        out.append('<polygon class="%s" points="%s"/>' % (cls, ' '.join(fmt(p) for p in poly)))
    if b.num:
        cx, cy = b.center()
        # callout: círculo numerado sobre la pieza
        dxl, dyl = {'back': (95, -35), 'bottom': (-110, 30), 'left': (-58, -70), 'divider': (34, 80), 'shelf-l': (-95, -6),
                    'right': (70, -40), 'top': (70, -50)}.get(b.name, (0, -60))
        out.append('<g class="callout"><line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/><circle cx="%.1f" cy="%.1f" r="15"/><text x="%.1f" y="%.1f">%d</text></g>'
                   % (cx, cy, cx + dxl, cy + dyl, cx + dxl, cy + dyl, cx + dxl, cy + dyl + 5.5, b.num))
    out.append('</g>')
# tornillos/espigas que aparecen al final (en las uniones frontales)
dowels = []
for x in (T / 2, mid, W - T / 2):
    for z in (T / 2, Hh / 2, Hh - T / 2):
        if (x == mid and z in (T / 2, Hh - T / 2)) or (x != mid and z == Hh / 2 and x in (T / 2, W - T / 2)):
            dowels.append(P(x, D, z))
out.append('<g class="dowels">')
for k, (px, py) in enumerate(dowels):
    out.append('<circle cx="%.1f" cy="%.1f" r="4.5" style="--k:%d"/>' % (px, py, k))
out.append('</g>')
# sello final "✓"
tx, ty = P(W + 0.8, D, Hh + 0.3)
out.append('<g transform="translate(%.1f %.1f)"><g class="stamp"><circle r="26"/><path d="M-11 1l7 7 15-16"/></g></g>' % (tx, ty))
out.append('</svg>')

svg = '\n'.join(out)
io.open(os.path.join(ROOT, '_src', '_hero-exploded.svg'), 'w', encoding='utf-8', newline='\n').write(svg)
print('viewBox', vb, '| orden:', [b.name for b in order], '| dowels', len(dowels))
