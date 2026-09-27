# -*- coding: utf-8 -*-
"""Validación rápida de las páginas construidas: title/description, h1, ids duplicados, tokens sin
   reemplazar, enlaces internos rotos, imágenes sin alt/dimensiones, etiquetas mal cerradas, JSON-LD.
   python _check.py
"""
import re, json, os, io, glob, sys
from html.parser import HTMLParser

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
VOID = {'br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'use', 'path', 'circle', 'rect', 'polygon', 'line', 'polyline', 'wbr'}
pages = ['index.html'] + sorted(g for g in glob.glob('*/index.html') if not g.startswith('_'))


class P(HTMLParser):
    def __init__(s):
        super().__init__()
        s.ids, s.h1, s.stack, s.errs, s.links, s.imgs, s.labels, s.controls = {}, 0, [], [], [], [], set(), []

    def handle_starttag(s, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            s.ids[a['id']] = s.ids.get(a['id'], 0) + 1
        if tag == 'h1':
            s.h1 += 1
        if tag == 'a' and a.get('href'):
            s.links.append(a['href'])
        if tag == 'img':
            s.imgs.append(a)
        if tag == 'label' and a.get('for'):
            s.labels.add(a['for'])
        if tag in ('input', 'select', 'textarea') and a.get('type') not in ('hidden', 'submit', 'button'):
            if 'label' in s.stack:
                a = dict(a, id=a.get('id') or '_implicit'); s.labels.add(a['id'])
            s.controls.append(a)
        if tag not in VOID:
            s.stack.append(tag)

    def handle_startendtag(s, tag, attrs):
        s.handle_starttag(tag, attrs)
        if tag not in VOID and s.stack and s.stack[-1] == tag:
            s.stack.pop()

    def handle_endtag(s, tag):
        if tag in VOID:
            return
        if s.stack and s.stack[-1] == tag:
            s.stack.pop()
        elif tag in s.stack:
            while s.stack and s.stack[-1] != tag:
                s.errs.append('unclosed <%s> before </%s>' % (s.stack.pop(), tag))
            s.stack.pop()
        else:
            s.errs.append('stray </%s>' % tag)


problems = 0
for pg in pages:
    s = io.open(pg, encoding='utf-8').read()
    p = P()
    p.feed(s)
    dup = [k for k, v in p.ids.items() if v > 1]
    tokens = re.findall(r'\{\{[A-Z]+\}\}', s)
    ld = re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S)
    ldok = []
    for l in ld:
        try:
            j = json.loads(l)
            ldok.append([g.get('@type') for g in j.get('@graph', [])])
        except Exception as e:
            ldok.append('ERR ' + str(e))
    base = os.path.dirname(pg)
    bad = []
    for h in p.links:
        if h.startswith(('http', 'mailto:', 'tel:', 'sms:', '#')):
            continue
        target = os.path.normpath(os.path.join(base, h.split('?')[0].split('#')[0]))
        if os.path.isdir(target):
            target = os.path.join(target, 'index.html')
        if not os.path.exists(target):
            bad.append(h)
    noalt = [i.get('src') for i in p.imgs if 'alt' not in i]
    nodim = [i.get('src') for i in p.imgs if not (i.get('width') and i.get('height'))]
    unlabelled = [c.get('name') or c.get('id') for c in p.controls if not (c.get('id') in p.labels or c.get('aria-label') or c.get('aria-labelledby'))]
    mt = re.search(r'<title>(.*?)</title>', s); md = re.search(r'name="description" content="(.*?)"', s)
    t = mt.group(1) if mt else ''; d = md.group(1) if md else ''
    flags = []
    if not (30 <= len(t) <= 66): flags.append('title %d chars' % len(t))
    if not (110 <= len(d) <= 165): flags.append('description %d chars' % len(d))
    if p.h1 != 1: flags.append('h1=%d' % p.h1)
    if dup: flags.append('dup ids %s' % dup)
    if tokens: flags.append('tokens %s' % tokens)
    if bad: flags.append('bad links %s' % bad[:6])
    if noalt: flags.append('img no alt %s' % noalt)
    if nodim: flags.append('img no w/h %s' % nodim)
    if p.errs: flags.append('html %s' % p.errs[:4])
    if p.stack: flags.append('unclosed at end %s' % p.stack[-4:])
    if unlabelled: flags.append('unlabelled controls %s' % unlabelled)
    if any(isinstance(x, str) for x in ldok): flags.append('jsonld %s' % ldok)
    problems += len(flags)
    print('%-34s %s' % (pg, ' | '.join(flags) if flags else 'OK  (ld: %s)' % (ldok[0] if ldok else '-')))
print('TOTAL flags:', problems)
