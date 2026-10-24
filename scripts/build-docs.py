#!/usr/bin/env python3
"""Render the website's tracked Markdown sources to static HTML. Requires Markdown."""
from pathlib import Path
import html
import re
import markdown

root = Path(__file__).resolve().parents[1]
site = root / 'tauri/website'
pages = {'guide': 'The ArchJet guide.', 'development': 'Under the hood.', 'verification': 'Tested, and still testing.', 'changelog': 'What’s new.'}
labels = {'guide': 'Using ArchJet', 'development': 'Development', 'verification': 'Verification', 'changelog': 'Changelog'}
keys = list(pages)
for index, (name, title) in enumerate(pages.items()):
    text = (site / 'content' / f'{name}.md').read_text()
    text = re.sub(r'^# [^\n]+\n', '', text, count=1)
    text = text.replace('](workspace-preview.png)', '](assets/workspace-preview.png)').replace('](verification.md)', '](verification.html)').replace('](development.md)', '](development.html)')
    md = markdown.Markdown(extensions=['fenced_code', 'tables', 'toc'])
    body = md.convert(text)
    body = body.replace('src="assets/workspace-preview.png"', 'data-theme-image data-light="assets/workspace-light.webp" data-dark="assets/workspace-dark.webp" loading="lazy" decoding="async" width="1360" height="900"')
    anchors = ''.join(f'<a href="#{html.escape(item["id"])}">{html.escape(item["name"])}</a>' for item in md.toc_tokens)
    links = ''.join(f'<a class="{"active" if key == name else ""}" {"aria-current=page" if key == name else ""} href="{key}.html">{label}</a>' for key, label in labels.items())
    pager = ''
    if index > 0:
        previous = keys[index - 1]
        pager += f'<a href="{previous}.html"><span>Previous</span>← {labels[previous]}</a>'
    if index < len(keys) - 1:
        following = keys[index + 1]
        pager += f'<a href="{following}.html"><span>Next</span>{labels[following]} →</a>'
    page = f'''<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} — ArchJet</title><meta name="description" content="ArchJet setup, usage, printer recovery and development documentation.">
<meta name="theme-color" content="#f7f7f4"><link rel="icon" href="assets/mark.svg">
<script src="theme.js"></script><link rel="stylesheet" href="style.css"><script defer src="site.js"></script>
</head><body class="doc"><a class="skip-link" href="#main">Skip to content</a>
<header class="site-header doc-header"><a class="wordmark" href="./"><img src="assets/mark.svg" width="34" height="34" alt="">ArchJet</a><nav aria-label="Main"><a href="./">Home</a><a class="source-link" href="https://github.com/wrestle-R/ArchJet">GitHub ↗</a></nav><label class="theme-control"><span class="sr-only">Appearance</span><select data-theme-select aria-label="Appearance"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></header>
<main id="main" class="doc-layout"><nav class="doc-nav" aria-label="Guide navigation"><div class="doc-links"><span class="doc-group">Documentation</span>{links}</div><details class="page-outline" open><summary>On this page</summary>{anchors}</details></nav>
<article><p class="overline">ArchJet / {html.escape(name)}</p><h1>{html.escape(title)}</h1>{body}<nav class="doc-pager" aria-label="Documentation pages">{pager}</nav></article></main><script>archjetTheme.apply();</script>
<footer class="wrap"><a class="wordmark" href="./"><img src="assets/mark.svg" width="28" height="28" alt="">ArchJet</a><p>Good ideas deserve paper.</p><a href="./#install">Get ArchJet ↗</a><a href="https://github.com/wrestle-R/ArchJet">GitHub ↗</a></footer>
<p id="copy-status" class="sr-only" role="status"></p></body></html>'''
    (site / f'{name}.html').write_text(page)
print('Rendered 4 documentation pages.')
