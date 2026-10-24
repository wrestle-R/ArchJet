#!/usr/bin/env python3
"""Validate local website links/assets without contacting external services."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
root = Path(__file__).resolve().parents[1] / 'tauri/website'
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.links = []; self.ids = set()
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs: self.ids.add(attrs['id'])
        for key in ('href', 'src', 'data-light', 'data-dark'):
            if key in attrs: self.links.append(attrs[key])
        for key in ('srcset', 'data-light-srcset', 'data-dark-srcset'):
            if key in attrs: self.links.extend(item.strip().split()[0] for item in attrs[key].split(','))
parsed = {}
for path in root.glob('*.html'):
    parser = Links(); parser.feed(path.read_text()); parsed[path.resolve()] = parser
for page, parser in parsed.items():
    for link in parser.links:
        url = urlsplit(link)
        if url.scheme or url.netloc: continue
        target = (page.parent / unquote(url.path)).resolve() if url.path else page
        if target.is_dir(): target /= 'index.html'
        assert target.exists(), f'{page.name}: missing {link}'
        if url.fragment and target in parsed:
            assert unquote(url.fragment) in parsed[target].ids, f'{page.name}: missing fragment {link}'
for page in parsed:
    text = page.read_text()
    assert text.index('src="theme.js"') < text.index('href="style.css"'), f'{page.name}: theme must resolve before CSS'
    assert 'data-theme-select' in text and 'src="site.js"' in text, f'{page.name}: missing shared appearance controls'
for image in root.glob('assets/workspace-*.webp'):
    assert image.stat().st_size < 100_000, f'{image.name}: workspace image exceeds budget'
print(f'Validated {len(parsed)} HTML pages and all local links/assets.')
