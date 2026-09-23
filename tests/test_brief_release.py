"""Release checks for the actual built planner across Chromium, Firefox and WebKit.

BROWSER selects the installed Playwright engine. AXE_PATH points to the pinned
axe-core distribution. BRIEF_BASE_URL optionally checks a deployed release using
fresh, disposable browser contexts and synthetic input only. No form uploads,
model calls, or external requests are allowed. WebKit is not branded Safari.
"""
import functools
import hashlib
import json
import os
from pathlib import Path
import re
import threading
import unittest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
ENGINE = os.environ.get('BROWSER', 'chromium')
assert ENGINE in {'chromium', 'firefox', 'webkit'}
AXE = Path(os.environ['AXE_PATH'])
assert AXE.is_file(), 'Install pinned axe-core and set AXE_PATH.'
OUT = ROOT / '.test-results' / ('release-' + ENGINE)
OUT.mkdir(parents=True, exist_ok=True)
KEY = 'fronteraeval-brief-v1'
CSP = next(line.strip().split(': ', 1)[1] for line in (SITE / '_headers').read_text().splitlines()
           if line.strip().startswith('Content-Security-Policy:'))

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass
    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('X-Content-Type-Options', 'nosniff')
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
BASE = os.environ.get('BRIEF_BASE_URL', f'http://127.0.0.1:{server.server_port}').rstrip('/')
parsed = urlsplit(BASE)
assert parsed.hostname in {'127.0.0.1', 'fronteraeval.org', 'deploy-preview-33--fronteraeval.netlify.app'}
assert not parsed.username and not parsed.password and not parsed.query and not parsed.fragment
ORIGIN = f'{parsed.scheme}://{parsed.netloc}'

class ReleaseChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        launch = {'headless': True}
        if ENGINE == 'chromium' and os.environ.get('CHROMIUM_PATH'):
            launch['executable_path'] = os.environ['CHROMIUM_PATH']
        cls.browser = getattr(cls.pw, ENGINE).launch(**launch)
        (OUT / 'environment.json').write_text(json.dumps({
            'browser': ENGINE, 'version': cls.browser.version, 'base_url': BASE,
            'axe_sha256': hashlib.sha256(AXE.read_bytes()).hexdigest(),
            'source_commit': os.environ.get('GITHUB_SHA'),
            'note': 'WebKit engine testing is not branded Safari certification.'}, indent=2))
    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
    def setUp(self):
        self.context = self.browser.new_context(viewport={'width':1365, 'height':1000},
                                                color_scheme='light', accept_downloads=True)
        self.requests = []
        self.errors = []
        self.context.on('request', lambda r: self.requests.append((r.method, r.url)))
        def route_request(route):
            request = route.request
            if request.url == ORIGIN + '/__test__/axe.js':
                route.fulfill(status=200, content_type='application/javascript', body=AXE.read_bytes())
            elif request.url.startswith(ORIGIN + '/') and request.method == 'GET':
                route.continue_()
            else:
                route.abort()
        self.context.route('**/*', route_request)
        self.page = self.context.new_page()
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.open()
    def open(self):
        response = self.page.goto(BASE + '/brief/')
        self.assertEqual(response.status, 200)
        self.assertIn("script-src 'self'", response.headers.get('content-security-policy',''))
        expect(self.page.locator('#result-count')).to_contain_text('source families', timeout=20000)
    def tearDown(self):
        try:
            self.assertEqual(self.errors, [], 'Uncaught application errors')
            self.assertFalse([r for r in self.requests if r[0] != 'GET' or not r[1].startswith(ORIGIN + '/')],
                             'Unexpected request, write or external dependency')
        finally:
            self.context.close()
    def select(self, record='canonical:agentdojo', query='AgentDojo'):
        self.page.locator('#query').fill(query)
        button = self.page.locator(f'[data-add="{record}"]')
        group = button.locator('xpath=ancestor::details')
        if group.count() and not group.get_attribute('open'):
            group.locator('summary').click()
        button.click()
        expect(self.page.locator('#selections')).to_contain_text(query)
    def save(self):
        expect(self.page.locator('#save-status')).to_contain_text('Saved on this device')
    def populate(self):
        for field, value in {
            'title':'Synthetic release test', 'decision':'Assess a document assistant before a limited evaluation.',
            'system':'Test model with synthetic retrieval and restricted tools.',
            'context':'Spanish and English synthetic tasks; no personal data.',
            'constraints':'No execution or paid model calls in this plan.',
            'gaps':'Actual tool transfer remains untested.', 'next-steps':'Evaluation owner verifies the protocol.'
        }.items():
            self.page.locator('#'+field).fill(value)
        self.select()
        self.page.locator('#fit-0').select_option('direct')
        self.page.locator('#rationale-0').fill('Test the specified tool-injection surface.')
        self.page.locator('#gap-0').fill('Local users and deployment transfer require separate evidence.')
        self.page.locator('#next-0').fill('Check the exact protocol, permissions and scoring before execution.')
        self.save()
    def audit(self, name):
        if not self.page.evaluate('Boolean(window.axe)'):
            self.page.add_script_tag(url=ORIGIN + '/__test__/axe.js')
        result = self.page.evaluate("""async () => await axe.run(document, {
            runOnly: {type:'tag', values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}
        })""")
        (OUT / ('axe-' + name + '.json')).write_text(json.dumps(result, indent=2))
        self.page.screenshot(path=str(OUT / (name + '.png')), full_page=True)
        failures = [{'id':v['id'], 'impact':v['impact'], 'nodes':[n['target'] for n in v['nodes']]}
                    for v in result['violations']]
        self.assertEqual(failures, [], f'Accessibility violations in {name}')
    def test_complete_workflow_export_reload_import(self):
        self.populate()
        self.page.reload()
        expect(self.page.locator('#rationale-0')).to_have_value('Test the specified tool-injection surface.')
        with self.page.expect_download() as pending:
            self.page.locator('#export-json').click()
        json_path = OUT / 'synthetic-brief.json'
        pending.value.save_as(json_path)
        data = json.loads(json_path.read_text())
        self.assertEqual(data['kind'], 'planning-manifest')
        self.assertEqual(data['selections'][0]['fit'], 'direct')
        self.assertRegex(data['selections'][0]['catalogue_snapshot']['catalog_sha256'], r'^[0-9a-f]{64}$')
        with self.page.expect_download() as pending:
            self.page.locator('#export-markdown').click()
        md_path = OUT / 'synthetic-brief.md'
        pending.value.save_as(md_path)
        self.assertIn(data['selections'][0]['catalogue_snapshot']['catalog_sha256'], md_path.read_text())
        self.assertIn('not a safety approval', md_path.read_text())
        self.page.once('dialog', lambda dialog: dialog.accept())
        self.page.locator('#reset').click()
        expect(self.page.locator('#selections')).to_contain_text('No evaluations selected')
        self.page.locator('#import-file').set_input_files(str(json_path))
        expect(self.page.locator('#message')).to_contain_text('Brief opened')
        expect(self.page.locator('#fit-0')).to_have_value('direct')
        self.page.locator('.brief-preview summary').click()
        expect(self.page.locator('#preview')).to_contain_text('Synthetic release test')
        self.page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
        self.page.emulate_media(media='print')
        expect(self.page.locator('#print-view')).to_be_visible()
        expect(self.page.locator('#brief-main')).not_to_be_visible()
        expect(self.page.locator('#print-view')).to_contain_text('Test the specified tool-injection surface.')
        self.page.emulate_media(media='screen')
    def test_keyboard_names_and_focus(self):
        for field in ['title','decision','system','context','constraints','query','topic','gaps','next-steps']:
            expect(self.page.locator('#'+field)).to_have_accessible_name(re.compile('.+'))
        self.page.locator('#decision').focus()
        self.page.keyboard.press('Tab')
        expect(self.page.locator('#system')).to_be_focused()
        self.select()
        self.page.locator('[data-remove="0"]').focus()
        self.page.keyboard.press('Enter')
        expect(self.page.locator('#query')).to_be_focused()
        expect(self.page.locator('#message')).to_contain_text('removed')
        snapshot = self.page.locator('#brief-main').aria_snapshot()
        (OUT / 'accessibility-tree.txt').write_text(snapshot)
        self.assertIn('Start with the decision.', snapshot)
    def test_empty_light_accessibility(self):
        self.audit('empty-light')
    def test_selected_light_accessibility(self):
        self.populate()
        self.select('canonical:harmbench','HarmBench')
        self.save()
        self.page.locator('#comparison-details summary').click()
        self.page.locator('.brief-preview summary').click()
        self.audit('selected-light')
    def test_selected_dark_accessibility(self):
        self.populate()
        self.page.locator('#brief-theme').click()
        expect(self.page.locator('html')).to_have_attribute('data-theme','dark')
        self.audit('selected-dark')
    def test_mobile_accessibility_and_layout(self):
        self.populate()
        self.page.set_viewport_size({'width':320,'height':812})
        self.page.locator('#brief-theme').click()
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth-innerWidth'),1)
        self.audit('mobile-dark')
        for width in [375,768,1024]:
            self.page.set_viewport_size({'width':width,'height':900})
            self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth-innerWidth'),1)
    def test_unicode_input_and_rejected_import(self):
        self.page.locator('#title').fill('Prueba española 日本語 اختبار')
        self.save()
        self.page.locator('#query').fill('日本語の評価')
        expect(self.page.locator('#result-count')).to_contain_text('0 text matches')
        self.page.locator('#import-file').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'{invalid'})
        expect(self.page.locator('#message')).to_contain_text('not valid JSON')
        expect(self.page.locator('#title')).to_have_value('Prueba española 日本語 اختبار')
    def test_original_catalogue_still_operates(self):
        self.page.goto(BASE + '/')
        expect(self.page.locator('#home-query')).to_be_visible(timeout=20000)
        self.page.locator('#home-query').fill('AgentDojo')
        self.page.locator('#home-search button[type=submit]').click()
        expect(self.page.locator('#results')).to_contain_text('AgentDojo')
        self.page.locator('#results .eval-main').first.click()
        expect(self.page.locator('.record-content')).to_be_visible()
        self.page.locator('.brief-entry').click()
        expect(self.page.locator('#brief-main')).to_be_visible()

if __name__ == '__main__':
    try:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(ReleaseChecks)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        report = {'browser':ENGINE, 'tests':result.testsRun, 'passed':result.wasSuccessful(),
                  'failures':[(str(t),trace) for t,trace in result.failures],
                  'errors':[(str(t),trace) for t,trace in result.errors]}
        (OUT / 'release-results.json').write_text(json.dumps(report,indent=2))
        raise SystemExit(0 if result.wasSuccessful() else 1)
    finally:
        server.shutdown()
