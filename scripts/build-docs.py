#!/usr/bin/env python3
"""Render the website's tracked Markdown sources to static HTML. Requires Markdown."""
from pathlib import Path
import html
import re
import markdown
root = Path(__file__).resolve().parents[1]
site = root / 'tauri/website'
pages = {'guide': 'The ArchJet guide.', 'development': 'Under the hood.', 'verification': 'Tested, and still testing.', 'changelog': 'What’s new.'}
for name, title in pages.items():
    text = (site / 'content' / f'{name}.md').read_text()
    text = re.sub(r'^# [^\n]+\n', '', text, count=1)
    text = text.replace('](workspace-preview.png)', '](assets/workspace-preview.png)').replace('](verification.md)', '](verification.html)').replace('](development.md)', '](development.html)')
    md = markdown.Markdown(extensions=['fenced_code', 'tables', 'toc'])
    body = md.convert(text)
    anchors = ''.join(f'<a href="#{html.escape(item["id"])}">{html.escape(item["name"])}</a>' for item in md.toc_tokens)
    links = ''.join(f'<a class="{"active" if key == name else ""}" href="{key}.html">{label}</a>' for key, label in [('guide','Using ArchJet'),('development','Development'),('verification','Verification'),('changelog','Changelog')])
    page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)} — ArchJet</title><meta name="description" content="ArchJet setup, usage, printer recovery and development documentation."><link rel="icon" href="assets/mark.svg"><link rel="stylesheet" href="style.css"></head><body class="doc"><a class="skip-link" href="#main">Skip to content</a><header class="site-header doc-header"><a class="wordmark" href="./"><img src="assets/mark.svg" width="30" height="30" alt="">ArchJet<span class="wordmark-dot">.</span></a><nav aria-label="Main"><a href="./">Home</a><a href="https://github.com/wrestle-R/ArchJet">GitHub ↗</a></nav></header><main id="main" class="doc-layout"><nav class="doc-nav" aria-label="Guide navigation">{links}<span class="doc-group">On this page</span>{anchors}</nav><article><p class="overline">ArchJet / {html.escape(name)}</p><h1>{html.escape(title)}</h1>{body}</article></main><footer><a class="wordmark" href="./">ArchJet<span class="wordmark-dot">.</span></a><p>Built for the things worth putting on paper.</p><a href="https://github.com/wrestle-R/ArchJet">Source ↗</a></footer></body></html>'''
    (site / f'{name}.html').write_text(page)
print('Rendered 4 documentation pages.')
