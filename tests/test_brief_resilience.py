"""Additional review regressions. Synthetic data only; no model or external calls."""
import functools
import json
import os
import threading
import unittest
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
OUT = ROOT / '.test-results'
OUT.mkdir(exist_ok=True)
KEY = 'fronteraeval-brief-v1'
CSP = next(line.split(': ', 1)[1] for line in (SITE / '_headers').read_text().splitlines()
           if line.strip().startswith('Content-Security-Policy:'))

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass
    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        super().end_headers()
    def do_GET(self):
        if self.path.startswith('/api/weekly-status'):
            self.send_response(200); self.send_header('Content-Type', 'application/json')
            self.end_headers(); self.wfile.write(b'{}')
        else: super().do_GET()

class ReviewChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(SITE)))
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None,
                                           args=['--no-sandbox'])
    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown()
    def setUp(self):
        self.context = self.browser.new_context(viewport={'width':1365,'height':1000}, accept_downloads=True)
        self.context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(self.base) else route.abort())
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.ready(self.page)
    def tearDown(self):
        self.context.close()
        self.assertFalse(self.errors)
    def ready(self, page):
        page.goto(self.base + '/brief/')
        expect(page.locator('#result-count')).to_contain_text('source families', timeout=15000)
    def saved(self):
        return self.page.evaluate('(key) => localStorage.getItem(key)', KEY)
    def fixture(self, count=1, long_notes=False):
        return self.page.evaluate('''async ({count,longNotes}) => {
            const c=await import('/brief/core.js');const catalog=await(await fetch('/data/catalog.json')).json();
            const b=c.createBrief(c.snapshot(catalog));
            const records=count===1?[catalog.records.find(r=>r.id==='canonical:agentdojo')]:catalog.records.slice(0,count);
            for(const record of records){c.addSelection(b,record,c.snapshot(catalog));
              if(longNotes)Object.assign(b.selections.at(-1),{rationale:'a'.repeat(16000),gap:'b'.repeat(16000),next_action:'c'.repeat(16000)});}
            return JSON.stringify(c.manifest(b),null,2);
        }''', {'count':count,'longNotes':long_notes})
    def import_text(self, raw):
        self.page.locator('#import-file').set_input_files({'name':'review.json','mimeType':'application/json','buffer':raw.encode()})
    def corrupt(self):
        self.page.evaluate('(key) => localStorage.setItem(key,"{bad")', KEY)
        self.page.reload()
        expect(self.page.locator('#save-status')).to_contain_text('Nothing was overwritten')
    def test_deleted_last_field_is_flushed_before_navigation(self):
        self.page.locator('#title').fill('This must stay deleted')
        expect(self.page.locator('#save-status')).to_contain_text('Saved on this device')
        self.page.evaluate('''() => {const f=document.querySelector('#title');f.value='';
            f.dispatchEvent(new Event('input',{bubbles:true}));window.dispatchEvent(new Event('pagehide'));}''')
        self.assertEqual(json.loads(self.saved())['title'], '')
        self.page.reload(); expect(self.page.locator('#title')).to_have_value('')
    def test_example_cannot_silently_replace_an_unreadable_draft(self):
        self.corrupt(); dialogs=[]
        self.page.on('dialog',lambda dialog:(dialogs.append(dialog.message),dialog.dismiss()))
        self.page.locator('#example').click()
        self.assertEqual(len(dialogs),1);self.assertEqual(self.saved(),'{bad')
    def test_import_cannot_silently_replace_an_unreadable_draft(self):
        raw=self.fixture();self.corrupt();dialogs=[]
        self.page.on('dialog',lambda dialog:(dialogs.append(dialog.message),dialog.dismiss()))
        with self.page.expect_event('dialog'):
            self.import_text(raw)
        self.assertEqual(len(dialogs),1);self.assertEqual(self.saved(),'{bad')
    def test_explicit_confirmation_can_replace_an_unreadable_draft(self):
        self.corrupt();self.page.once('dialog',lambda dialog:dialog.accept())
        self.page.locator('#example').click()
        expect(self.page.locator('#title')).to_have_value('Tool-using assistant security')
        self.assertEqual(json.loads(self.saved())['title'],'Tool-using assistant security')
    def test_clear_in_another_tab_pauses_autosave(self):
        self.page.locator('#title').fill('Retain first-tab work')
        expect(self.page.locator('#save-status')).to_contain_text('Saved on this device')
        other=self.context.new_page();self.ready(other)
        other.evaluate('() => {localStorage.clear();}')
        expect(self.page.locator('#storage-conflict')).to_be_visible()
        self.page.locator('#title').fill('Do not silently resave this')
        self.page.wait_for_timeout(350);self.assertIsNone(self.saved())
    def test_large_legal_export_reopens_through_actual_file_input(self):
        raw=self.fixture(count=50,long_notes=True)
        self.assertGreater(len(raw.encode()),2_000_000)
        self.import_text(raw)
        expect(self.page.locator('#brief-count')).to_have_text('50 selected')
        with self.page.expect_download() as download:self.page.locator('#export-json').click()
        file=OUT/'large-brief-roundtrip.json';download.value.save_as(file)
        exported=json.loads(file.read_text());self.assertEqual(len(exported['selections']),50)
        self.assertEqual(exported['selections'][49]['gap'],'b'*16000)
        self.page.once('dialog',lambda dialog:dialog.accept())
        self.page.locator('#reset').click()
        self.page.locator('#import-file').set_input_files(str(file))
        expect(self.page.locator('#brief-count')).to_have_text('50 selected')
    def test_imported_date_payload_does_not_replace_work(self):
        raw=json.loads(self.fixture());raw['updated_at']='2026-09-23 (<img src=x onerror=alert(1)>)'
        self.page.locator('#title').fill('Keep this draft');self.import_text(json.dumps(raw))
        expect(self.page.locator('#message')).to_contain_text('Invalid brief dates')
        expect(self.page.locator('#title')).to_have_value('Keep this draft')
        self.assertEqual(self.page.locator('img').count(),0)
    def test_missing_source_fingerprint_is_visible(self):
        raw=json.loads(self.fixture());raw['selections'][0]['catalogue_snapshot']=None
        self.import_text(json.dumps(raw))
        expect(self.page.locator('#snapshot-warning')).to_contain_text('no catalogue fingerprint')
    def test_unicode_query_does_not_match_entire_catalogue(self):
        for query in ['日本語','проверка','🔍']:
            self.page.locator('#query').fill(query)
            expect(self.page.locator('#result-count')).to_contain_text('0 text matches')
        self.page.locator('#query').fill('prompt injection')
        expect(self.page.locator('#candidates')).to_contain_text('AgentDojo')
    def test_removing_selection_keeps_keyboard_focus(self):
        self.page.locator('#query').fill('AgentDojo')
        self.page.locator('[data-add="canonical:agentdojo"]').click()
        self.page.locator('[data-remove="0"]').click()
        expect(self.page.locator('#query')).to_be_focused()
        expect(self.page.locator('#brief-count')).to_have_text('0 selected')
    def test_cleared_draft_is_not_recreated_on_pagehide(self):
        self.page.locator('#title').fill('Clear it')
        self.page.once('dialog',lambda dialog:dialog.accept());self.page.locator('#reset').click()
        self.page.evaluate("window.dispatchEvent(new Event('pagehide'))")
        self.assertIsNone(self.saved())
    def test_viewports_and_supporting_method_link(self):
        self.page.screenshot(path=str(OUT/'review-desktop.png'),full_page=True)
        for width in [320,375,768,1024,1365]:
            self.page.set_viewport_size({'width':width,'height':900})
            overflow=self.page.evaluate("() => [...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width && r.right>innerWidth+1}).map(el=>({tag:el.tagName,id:el.id,cls:el.className,right:el.getBoundingClientRect().right})).slice(0,20)")
            self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth-innerWidth'),1,f'planner {width}: {overflow}')
        self.page.locator('#brief-theme').click()
        self.page.set_viewport_size({'width':375,'height':812})
        self.page.screenshot(path=str(OUT/'review-mobile-dark.png'),full_page=True)
        self.page.goto(self.base+'/method/')
        expect(self.page.get_by_role('link',name='Read the source attribution policy')).to_have_attribute('href','https://github.com/apolmig/fronteraeval/blob/main/ATTRIBUTION.md')
        self.page.goto(self.base+'/');expect(self.page.locator('#home-query')).to_be_visible()
        for width in [320,375,768,1024,1365]:
            self.page.set_viewport_size({'width':width,'height':900})
            self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth-innerWidth'),1,f'catalogue {width}')

if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ReviewChecks))
    (OUT/'review-browser-results.json').write_text(json.dumps({'tests_run':result.testsRun,'failures':len(result.failures),'errors':len(result.errors)},indent=2))
    raise SystemExit(0 if result.wasSuccessful() else 1)
