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
        for key in ('href', 'src'):
            if key in attrs: self.links.append(attrs[key])
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
assert (root / 'assets/hero-paper.png').exists()
print(f'Validated {len(parsed)} HTML pages and all local links/assets.')
