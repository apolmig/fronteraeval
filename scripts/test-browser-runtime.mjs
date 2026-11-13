// Run against a built, locally served site. Install Playwright separately if needed.
// QA_BASE_URL=http://127.0.0.1:8765 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/test-browser-runtime.mjs
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:8765';
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const catalogue = process.env.QA_CATALOG_PATH ? JSON.parse(await readFile(process.env.QA_CATALOG_PATH, 'utf8')) : null;
const reports = [];
const screenshots = process.env.QA_SCREENSHOTS || '/tmp/frontera-runtime-qa';
await mkdir(screenshots, { recursive: true });
try {
  for (const [device, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
    const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [], consoleErrors = [];
    await page.addInitScript(() => { globalThis.qaLongTasks = []; new PerformanceObserver(list => globalThis.qaLongTasks.push(...list.getEntries().map(entry => Math.round(entry.duration)))).observe({ type: 'longtask', buffered: true }); });
    let catalogRequests = 0, releaseStatus;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', request => { if (new URL(request.url()).pathname === '/data/catalog.json') catalogRequests++; });
    if (catalogue) await page.route('**/data/catalog.json', route => route.fulfill({ json: catalogue }));
    await page.route('**/api/weekly-status', async route => {
      await new Promise(resolve => { releaseStatus = resolve; });
      await route.fulfill({ json: { status: 'current', checked_at: new Date().toISOString(), inspect: { entries: [{
        id: 'qa:unreviewed-live-entry', name: 'QA live entry', source_type: 'inspect-internal', source_url: 'https://example.com/qa'
      }] } } });
    });
    await page.goto(base);
    await page.locator('#home-query').fill('harmful manipulation');
    await page.waitForFunction(() => document.querySelector('#home-query') === document.activeElement);
    releaseStatus();
    await page.waitForFunction(() => document.querySelector('[data-live-freshness]')?.textContent.includes('Sources checked'));
    assert.equal(await page.locator('#home-query').inputValue(), 'harmful manipulation');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'home-query');
    assert.equal(catalogRequests, 1, 'The app and enhancers must share one catalogue request');
    const admittedCount = await page.evaluate(async () => (await globalThis.FronteraEvalCatalogPromise).records.length);
    assert.ok((await page.locator('.catalogue-meta').textContent()).includes(`${admittedCount} catalogue records`), 'Sweep observations must not change admitted catalogue counts');
    await page.screenshot({ path: `${screenshots}/${device}-home.png`, fullPage: true });
    await page.locator('#home-query').press('Enter');
    await page.locator('#filter-q').waitFor();
    const queries = {};
    for (const query of ['harmful manipulation', 'autonomous R&D', 'jailbreak robustness', 'scheming', 'persuassion']) {
      await page.locator('#filter-q').fill(query);
      await page.waitForFunction(() => document.querySelectorAll('.eval-row').length > 0);
      queries[query] = await page.locator('#result-count').textContent();
      assert.ok(await page.locator('.eval-row .source-link').count());
      await page.waitForFunction(() => [...document.querySelectorAll('.eval-row')].every(row => row.dataset.attributionFor));
    }
    await page.screenshot({ path: `${screenshots}/${device}-search.png`, fullPage: true });
    await page.locator('#filter-q').fill('');
    await page.locator('#filter-status').selectOption('reviewed');
    const reviewedCount = await page.evaluate(async () => (await globalThis.FronteraEvalCatalogPromise).records.filter(record => record.review_status === 'reviewed').length);
    assert.equal(await page.locator('#result-count').textContent(), `${reviewedCount} records`);
    await page.locator('#clear-filters').click();
    await page.locator('[data-page="2"]').click();
    assert.match(page.url(), /page=2/);
    await page.waitForFunction(() => [...document.querySelectorAll('.eval-row')].every(row => row.dataset.attributionFor));
    await page.locator('#filter-q').focus();
    for (const shortcut of ['Control+k', 'Meta+k']) {
      await page.keyboard.press(shortcut);
      await page.locator('#command-palette-input').fill('APE');
      await page.locator('.command-option').first().waitFor();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#command-option-1').getAttribute('aria-selected'), 'true');
      await page.keyboard.press('Escape');
      await page.locator('#command-palette').waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => document.activeElement.id), 'filter-q');
    }
    await page.keyboard.press('Control+k');
    await page.locator('#command-palette-input').fill('APE');
    await page.locator('.command-option').first().waitFor();
    await page.keyboard.press('Enter');
    await page.locator('.record-head').waitFor();
    assert.match(page.url(), /#\/eval\//);
    const reviewed = catalogue?.records.find(record => record.methodological_review) || await page.evaluate(async () => (await globalThis.FronteraEvalCatalogPromise).records.find(record => record.methodological_review));
    await page.evaluate(id => { location.hash = `/eval/${encodeURIComponent(id)}`; }, reviewed.id);
    await page.locator('[data-methodological-assessment]').waitFor();
    await page.evaluate(() => { for (let i = 0; i < 100; i++) document.dispatchEvent(new CustomEvent('fronteraeval:rendered')); });
    await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-methodological-assessment]').count(), 1);
    assert.equal(await page.locator('.source-resolution-block').count(), 1);
    await page.screenshot({ path: `${screenshots}/${device}-detail.png`, fullPage: true });
    await page.locator('#copy-record-link').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await page.locator('link[rel="canonical"]').getAttribute('href'));
    const idle = await page.evaluate(async () => {
      let mutations = 0;
      const observer = new MutationObserver(records => { mutations += records.length; });
      observer.observe(document.querySelector('#main'), { childList: true, subtree: true, attributes: true });
      const start = performance.now();
      await new Promise(resolve => setTimeout(resolve, 500));
      observer.disconnect();
      return { mutations, elapsedMs: Math.round(performance.now() - start) };
    });
    assert.equal(idle.mutations, 0, 'Enhancers must settle without continuously rewriting the DOM');
    const longTasks = await page.evaluate(() => globalThis.qaLongTasks);
    const pending = await page.evaluate(async () => (await globalThis.FronteraEvalCatalogPromise).records.find(record => record.methodological_review?.status === 'needs-reevaluation'));
    if (pending) {
      await page.evaluate(id => { location.hash = `/eval/${encodeURIComponent(id)}`; }, pending.id);
      await page.locator('[data-methodological-assessment] h2').filter({ hasText: 'Review needs reassessment' }).waitFor();
      assert.equal(await page.locator('.methodological-grid').count(), 0);
      await page.screenshot({ path: `${screenshots}/${device}-pending-review.png`, fullPage: true });
    }
    await page.evaluate(() => { location.hash = '/eval/qa%3Aunreviewed-live-entry'; });
    await page.locator('h1').filter({ hasText: 'Not found' }).waitFor();
    await page.evaluate(() => { location.hash = '/eval/%'; });
    await page.locator('h1').filter({ hasText: 'Not found' }).waitFor();
    await page.evaluate(() => { location.hash = '/about'; });
    await page.locator('[data-ui-about]').waitFor();
    assert.match(await page.locator('[data-ui-about]').textContent(), /not an independent replication/);
    assert.equal(await page.locator('[data-nav="collection"]').count(), 0);
    const oldTheme = await page.locator('html').getAttribute('data-theme');
    await page.locator('#theme-toggle').click();
    const theme = await page.locator('html').getAttribute('data-theme');
    assert.notEqual(theme, oldTheme);
    // Subsequent documents receive an immediate status response; the delayed case was verified above.
    await page.unroute('**/api/weekly-status');
    await page.route('**/api/weekly-status', route => route.fulfill({ json: { status: 'unverified' } }));
    await page.reload();
    await page.locator('[data-ui-about]').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page overflows horizontally');
    await page.goto(`${base}/brief/`);
    await page.locator('.candidate').first().waitFor();
    await page.locator('#example').click();
    assert.ok((await page.locator('#decision').inputValue()).length > 0);
    await page.locator('#save-status').filter({ hasText: 'Saved on this device' }).waitFor();
    const decision = await page.locator('#decision').inputValue();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-json').click()]);
    assert.match(download.suggestedFilename(), /\.json$/);
    await page.reload();
    await page.locator('#decision').filter({ visible: true }).waitFor();
    assert.equal(await page.locator('#decision').inputValue(), decision);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Brief overflows horizontally');
    await page.screenshot({ path: `${screenshots}/${device}-brief.png`, fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
    reports.push({ device, queries, idle, longTasksMs: longTasks, screenshots, pageErrors: errors, consoleErrors, catalogue: catalogue ? 'explicit fixture' : 'local build' });
    await context.close();
  }
  console.log(JSON.stringify(reports, null, 2));
} finally { await browser.close(); }
