"""Browser acceptance tests against the built site and its real catalogue.

Run after `npm run build`: python tests/test_brief_browser.py
Requires playwright==1.57.0 and Chromium. Never calls model APIs or external sites.
"""
import functools
import hashlib
import json
import os
from pathlib import Path
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
OUT = ROOT / '.test-results'
OUT.mkdir(exist_ok=True)
KEY = 'fronteraeval-brief-v1'
CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass
    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        super().end_headers()
    def do_GET(self):
        if self.path.startswith('/api/weekly-status'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{}')
        else:
            super().do_GET()

server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(SITE)))
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{server.server_port}'
results = []

def passed(name):
    results.append(name)
    print('PASS', name, flush=True)

def ready(page):
    page.goto(BASE + '/brief/')
    expect(page.locator('#result-count')).to_contain_text('source families', timeout=15000)

def add(page, record, query):
    page.locator('#query').fill(query)
    page.locator(f'[data-add="{record}"]').click()
    expect(page.locator('#selections')).to_contain_text(query)

try:
    with sync_playwright() as pw:
        executable = os.environ.get('CHROMIUM_PATH')
        browser = pw.chromium.launch(headless=True, executable_path=executable or None,
                                     args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1365, 'height': 1000}, accept_downloads=True)
        requests = []
        context.on('request', lambda req: requests.append((req.method, req.url)))
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(BASE) else route.abort())
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        ready(page)
        expect(page.locator('#selections')).to_contain_text('No evaluations selected')
        page.screenshot(path=str(OUT / 'brief-desktop.png'), full_page=True)
        passed('published catalogue loads with production CSP')

        page.locator('#title').fill('Assistant evaluation test')
        page.locator('#decision').fill('Assess indirect injection without sacrificing legitimate tasks.')
        page.locator('#system').fill('Test model v1 with retrieval and restricted document tools.')
        page.locator('#context').fill('Spanish and English test tasks, synthetic documents, internal reviewers.')
        page.locator('#constraints').fill('Offline sandbox; synthetic data only; no paid execution.')
        add(page, 'canonical:agentdojo', 'AgentDojo')
        add(page, 'canonical:harmbench', 'HarmBench')
        expect(page.locator('#brief-count')).to_have_text('2 selected')
        expect(page.locator('#fit-0')).to_have_value('unassessed')
        page.locator('#fit-0').select_option('direct')
        page.locator('#rationale-0').fill('Relevant to the specified tool-injection surface.')
        page.locator('#gap-0').fill('Local language and tool-transfer evidence remains missing.')
        page.locator('#next-0').fill('Verify the pinned protocol in a synthetic sandbox.')
        page.locator('#fit-1').select_option('adjacent')
        page.locator('#rationale-1').fill('Separately examine harmful-request behavior, not injection resilience.')
        page.locator('#gap-1').fill('This does not replace indirect-injection testing.')
        page.locator('#next-1').fill('Review the protocol and retain separate outcomes.')
        page.locator('#gaps').fill('Realistic tool configurations and language transfer require further tests.')
        page.locator('#next-steps').fill('Evaluation owner reviews the protocol before any execution.')
        expect(page.locator('#save-status')).to_contain_text('Saved on this device')
        page.locator('#comparison-details summary').click()
        expect(page.locator('#comparison table')).to_be_visible()
        expect(page.locator('#comparison')).to_contain_text('Comparability conditions')
        passed('question, manual shortlist, fit, gaps and method comparison')

        page.reload()
        expect(page.locator('#rationale-0')).to_have_value('Relevant to the specified tool-injection surface.')
        expect(page.locator('#fit-1')).to_have_value('adjacent')
        passed('reload preserves selections, notes and fit without inferring new judgements')

        with page.expect_download() as info:
            page.locator('#export-json').click()
        export = info.value
        export.save_as(OUT / 'brief-test.json')
        data = json.loads((OUT / 'brief-test.json').read_text())
        assert data['kind'] == 'planning-manifest'
        assert len(data['selections']) == 2
        expected_hash = hashlib.sha256((SITE / 'data/catalog.json').read_bytes()).hexdigest()
        assert data['selections'][0]['catalogue_snapshot']['catalog_sha256'] == expected_hash
        with page.expect_download() as info:
            page.locator('#export-markdown').click()
        info.value.save_as(OUT / 'brief-test.md')
        assert expected_hash in (OUT / 'brief-test.md').read_text()
        assert 'not a safety approval' in (OUT / 'brief-test.md').read_text()
        passed('JSON and Markdown exports preserve actual source fingerprints and boundaries')

        page.locator('.brief-preview summary').click()
        expect(page.locator('#preview')).to_contain_text('Assistant evaluation test')
        page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
        page.emulate_media(media='print')
        expect(page.locator('#print-view')).to_be_visible()
        expect(page.locator('#brief-main')).not_to_be_visible()
        expect(page.locator('#print-view')).to_contain_text(expected_hash)
        page.emulate_media(media='screen')
        passed('readable preview and printable evidence retain notes, versions and source IDs')

        page.locator('#title').fill('<img src=x onerror=alert(1)>')
        expect(page.locator('#preview')).to_contain_text('<img src=x onerror=alert(1)>')
        assert page.locator('#preview img').count() == 0
        assert not any('onerror' in url for _, url in requests)
        page.locator('#title').fill('Assistant evaluation test')
        passed('hostile text is displayed as text and does not execute')

        page.locator('#decision').focus()
        page.keyboard.press('Tab')
        expect(page.locator('#system')).to_be_focused()
        passed('labelled fields support keyboard progression')

        # Saved evidence is retained even when the fetched catalogue changes.
        changed_catalog = json.loads((SITE / 'data/catalog.json').read_text())
        changed_catalog['generated_at'] = '2099-01-01T00:00:00Z'
        for record in changed_catalog['records']:
            if record['id'] == 'canonical:agentdojo':
                record['measures'] = 'NEW CONTENT NOT AUTOMATICALLY ADOPTED'
        page.route('**/data/catalog.json', lambda route: route.fulfill(json=changed_catalog))
        page.reload()
        expect(page.locator('#snapshot-warning')).to_be_visible()
        assert 'NEW CONTENT' not in page.locator('#selections').inner_text()
        saved = json.loads(page.evaluate(f'localStorage.getItem({json.dumps(KEY)})'))
        assert saved['selections'][0]['catalogue_snapshot']['catalog_sha256'] == expected_hash
        passed('catalogue updates do not silently replace captured evidence')

        page.unroute('**/data/catalog.json')
        page.route('**/data/catalog.json', lambda route: route.fulfill(status=503, body='Unavailable'))
        page.reload()
        expect(page.locator('#catalogue-error')).to_be_visible()
        expect(page.locator('#rationale-0')).to_have_value('Relevant to the specified tool-injection surface.')
        with page.expect_download() as info:
            page.locator('#export-json').click()
        assert info.value.suggested_filename.endswith('.json')
        passed('saved brief remains editable and exportable when catalogue is unavailable')
        page.unroute('**/data/catalog.json')

        # A malformed import must not replace current work.
        page.locator('#import-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{bad'})
        expect(page.locator('#message')).to_contain_text('not valid JSON')
        expect(page.locator('#title')).to_have_value('Assistant evaluation test')
        passed('invalid import leaves the current draft unchanged')

        # A second browser origin-context has no draft until JSON is imported.
        fresh = browser.new_context(viewport={'width':1365,'height':1000})
        imported = fresh.new_page()
        ready(imported)
        imported.locator('#import-file').set_input_files(str(OUT / 'brief-test.json'))
        expect(imported.locator('#rationale-0')).to_have_value('Relevant to the specified tool-injection surface.')
        expect(imported.locator('#fit-1')).to_have_value('adjacent')
        passed('JSON reopens the captured plan on another browser context')

        # Two tabs must not overwrite one another silently.
        other = fresh.new_page()
        ready(other)
        other.locator('#title').fill('Changed in second tab')
        expect(other.locator('#save-status')).to_contain_text('Saved on this device')
        expect(imported.locator('#storage-conflict')).to_be_visible()
        imported.locator('#title').fill('Unsaved first-tab version')
        imported.wait_for_timeout(400)
        assert json.loads(other.evaluate(f'localStorage.getItem({json.dumps(KEY)})'))['title'] == 'Changed in second tab'
        passed('concurrent tabs pause autosave instead of overwriting another draft')
        fresh.close()

        blocked = browser.new_context()
        blocked.add_init_script("Storage.prototype.setItem = function(){throw new DOMException('Blocked','QuotaExceededError')}")
        blocked_page = blocked.new_page(); ready(blocked_page)
        blocked_page.locator('#decision').fill('Keep this work despite blocked storage.')
        expect(blocked_page.locator('#save-status')).to_contain_text('Not saved locally')
        with blocked_page.expect_download() as info:
            blocked_page.locator('#export-json').click()
        assert info.value.suggested_filename.endswith('.json')
        passed('blocked local storage reports failure honestly and still permits export')
        blocked_page.evaluate("() => { Storage.prototype.removeItem = function(){throw new DOMException('Blocked','SecurityError')}; }")
        blocked_page.once('dialog', lambda d: d.accept())
        blocked_page.locator('#reset').click()
        expect(blocked_page.locator('#save-status')).to_contain_text('Cleared this tab only')
        passed('blocked draft deletion is not falsely reported as successful')
        blocked.close()

        corrupt = browser.new_context()
        corrupt.add_init_script(f"localStorage.setItem({json.dumps(KEY)}, '{{bad');")
        corrupt_page = corrupt.new_page(); ready(corrupt_page)
        expect(corrupt_page.locator('#save-status')).to_contain_text('Nothing was overwritten')
        corrupt_page.locator('#decision').fill('Unsaved work')
        corrupt_page.wait_for_timeout(400)
        assert corrupt_page.evaluate(f'localStorage.getItem({json.dumps(KEY)})') == '{bad'
        corrupt_page.once('dialog', lambda d: d.accept())
        corrupt_page.locator('#reset').click()
        assert corrupt_page.evaluate(f'localStorage.getItem({json.dumps(KEY)})') is None
        passed('corrupt saved draft is protected until an explicit clear action')
        corrupt.close()

        mobile = browser.new_context(viewport={'width':375,'height':812}, is_mobile=True, has_touch=True)
        mp = mobile.new_page(); ready(mp)
        add(mp,'canonical:agentdojo','AgentDojo')
        mp.locator('#review-title').scroll_into_view_if_needed()
        assert mp.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        expect(mp.locator('#fit-0')).to_be_visible()
        mp.screenshot(path=str(OUT / 'brief-mobile.png'), full_page=True)
        passed('375px mobile shortlist and review do not overflow the viewport')
        mp.locator('#brief-theme').click()
        expect(mp.locator('html')).to_have_attribute('data-theme','dark')
        colours = mp.evaluate("({bg:getComputedStyle(document.body).backgroundColor,ink:getComputedStyle(document.body).color})")
        assert colours['bg'] != colours['ink']
        assert colours['bg'] not in ['rgb(255, 253, 250)', 'rgb(247, 245, 239)'], colours
        mp.screenshot(path=str(OUT / 'brief-mobile-dark.png'), full_page=True)
        passed('dark theme inherits readable background and foreground colours')
        mobile.close()

        # Test the entire original application, not merely a simplified observer fixture.
        site = context.new_page()
        site.on('pageerror', lambda error: errors.append(str(error)))
        site.goto(BASE + '/')
        expect(site.locator('#home-query')).to_be_visible(timeout=15000)
        expect(site.locator('.brief-entry')).to_have_attribute('href','/brief/')
        site.wait_for_timeout(700)
        site.evaluate("window.mutations=0;window.mo=new MutationObserver(m=>window.mutations+=m.length);window.mo.observe(document.querySelector('#main'),{childList:true,subtree:true});")
        site.wait_for_timeout(500)
        assert site.evaluate('window.mutations') == 0
        site.locator('#home-query').fill('AgentDojo')
        site.locator('#home-search button[type=submit]').click()
        expect(site.locator('#results')).to_contain_text('AgentDojo')
        site.wait_for_timeout(500)
        site.evaluate('window.mutations=0')
        site.wait_for_timeout(500)
        assert site.evaluate('window.mutations') == 0
        site.locator('#results .eval-main').first.click()
        expect(site.locator('.record-content')).to_be_visible()
        site.wait_for_timeout(600)
        site.evaluate('window.mutations=0')
        site.wait_for_timeout(500)
        assert site.evaluate('window.mutations') == 0
        passed('full legacy home, search and detail settle after the attribution fix')
        site.set_viewport_size({'width':375,'height':812})
        site.goto(BASE+'/')
        expect(site.locator('.brief-entry')).to_be_visible()
        assert site.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        passed('catalogue entry point remains usable on mobile')

        assert not errors, errors
        assert all(method == 'GET' for method, _ in requests)
        passed('no uncaught browser errors, model calls, form posts or draft uploads')
        context.close(); browser.close()
finally:
    server.shutdown()
    (OUT / 'browser-results.json').write_text(json.dumps({'passed':results,'count':len(results)},indent=2))
print(f'Completed {len(results)} browser acceptance checks.')
