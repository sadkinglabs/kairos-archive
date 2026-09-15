"""Read-only content checks against a built site and its registry export.

Usage: python scripts/review-build.py ../sorcery-registry/export/registry.json
This checks output content and links; it is not a browser/layout test.
"""
import json
import re
import sys
import unicodedata
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.links, self.ids, self.copies, self.rules = [], set(), set(), []
        self.searches = 0
        self.rule = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            assert a['id'] not in self.ids, f"Duplicate HTML ID {a['id']}"
            self.ids.add(a['id'])
        if tag == 'a' and 'href' in a:
            self.links.append(a['href'])
        if 'data-copy' in a:
            self.copies.add(a['data-copy'])
        if tag == 'input' and a.get('type') == 'search' and a.get('name') == 'q':
            self.searches += 1
        if tag == 'pre' and 'rules' in a.get('class', '').split():
            self.rule = ''

    def handle_data(self, data):
        if self.rule is not None:
            self.rule += data

    def handle_endtag(self, tag):
        if tag == 'pre' and self.rule is not None:
            self.rules.append(self.rule)
            self.rule = None


def slug(name):
    return re.sub('[^a-z0-9]+', '-', unicodedata.normalize('NFKD', name.lower())).strip('-') or 'card'


registry = json.loads(Path(sys.argv[1]).read_text())
dist = Path('dist')
pages = {}
for file in dist.rglob('*.html'):
    path = '/' + file.relative_to(dist).as_posix().removesuffix('.html')
    path = '/' if path == '/index' else path
    pages[path] = Page(file.read_text())

for path, page in pages.items():
    assert page.searches == 1, (path, 'expected one card search field', page.searches)
    assert '/usage' in page.links and '/docs' in page.links, (path, 'missing credit or API navigation')
    for href in page.links:
        url = urlsplit(href)
        if url.scheme or url.netloc:
            continue
        target = unquote(url.path) or path
        if not target.startswith('/'):
            continue
        if target in pages:
            if url.fragment:
                assert unquote(url.fragment) in pages[target].ids, (path, href, 'missing anchor')
        else:
            assert (dist / target.lstrip('/')).exists(), (path, href, 'missing local destination')

for card in registry['cards']:
    path = f"/cards/{card['codex_id']}/{slug(card['name'])}"
    page = pages[path]
    assert card['codex_id'] in page.copies, (path, 'card ID is not copyable')
    assert card['api_url'] in page.links, (path, 'missing card JSON')
    assert page.rules[0] == (card['rules_text'] or 'No rules text'), (path, 'changed current rules')
    if card['back']:
        assert page.rules[1] == (card['back']['rules_text'] or 'No rules text'), (path, 'changed back rules')
    for printing_id in card['printing_ids']:
        assert f'/printings/{printing_id}' in page.links, (path, printing_id)
    if card['image_urls']:
        assert all(card['image_urls'][s] in page.links for s in ('small', 'normal', 'large', 'original'))

for printing in registry['printings']:
    path = f"/printings/{printing['printing_id']}"
    page = pages[path]
    assert printing['printing_id'] in page.copies and printing['codex_id'] in page.copies, (path, 'missing copyable IDs')
    assert printing['api_url'] in page.links, (path, 'missing printing JSON')
    for face in (printing, printing.get('back')):
        if face and face.get('image_urls'):
            assert all(face['image_urls'][s] in page.links for s in ('small', 'normal', 'large', 'original')), (path, 'missing image rendition')

for set_record in registry['sets']:
    path = f"/sets/{set_record['set_code'] or 'none'}"
    if set_record['api_url']:
        assert set_record['api_url'] in pages[path].links, (path, 'missing set JSON')

redirects = (dist / '_redirects').read_text().splitlines()
for card in registry['cards']:
    assert f"/cards/{card['codex_id']} /cards/{card['codex_id']}/{slug(card['name'])} 302" in redirects

print(f"PASS: {len(pages):,} pages; internal links and anchors; one search per page; attribution and docs navigation.")
print(f"PASS: {len(registry['cards']):,} exact current card texts, back faces and complete printing links.")
print(f"PASS: {len(registry['printings']):,} copyable printing IDs, card IDs, JSON and all image renditions.")
print(f"PASS: all set JSON links and {len(redirects):,} existing card redirects.")
print('NOT CHECKED: browser interactions, visual layouts, external URL availability.')
