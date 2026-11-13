import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const enhancers = ['attribution.js', 'enhancements.js', 'methodological-reviews.js', 'seo-runtime.js', 'ui-controls.js'];
test('enhancements subscribe to explicit rendering rather than observing their own DOM writes', async () => {
  for (const file of enhancers) {
    const text = await readFile(`site/${file}`, 'utf8');
    assert.ok(!text.includes('new MutationObserver'), `${file}: recursive observer reintroduced`);
    assert.ok(text.includes('fronteraeval:rendered'), `${file}: render lifecycle listener missing`);
    assert.ok(text.includes('FronteraEvalCatalogPromise'), `${file}: shared catalogue request missing`);
    new vm.Script(text, { filename: file });
  }
  const app = await readFile('site/app.js', 'utf8');
  assert.match(app, /notifyRendered\(path\)/);
  assert.match(app, /notifyRendered\("\/evals"\)/);
  assert.match(app, /hydrateLiveStatus/);
  new vm.Script(app);
});

test('concurrent render requests insert one reassessment notice without presenting old conclusions', async () => {
  const source = await readFile('site/methodological-reviews.js', 'utf8');
  const frames = [], listeners = new Map(), insertions = [];
  let resolveCatalog;
  const content = {
    querySelector: () => null,
    insertAdjacentHTML: (_, markup) => insertions.push(markup)
  };
  const main = {
    querySelector: selector => selector === '.record-content' ? content
      : selector === '[data-methodological-assessment]' && insertions.length ? {} : null
  };
  const context = {
    document: { querySelector: () => main, addEventListener: (name, callback) => listeners.set(name, callback) },
    location: { hash: '#/eval/test%3Aexample' },
    window: { addEventListener() {} },
    requestAnimationFrame: callback => frames.push(callback),
    FronteraEvalCatalogPromise: new Promise(resolve => { resolveCatalog = resolve; })
  };
  vm.runInNewContext(source, context);
  frames.shift()();
  listeners.get('fronteraeval:rendered')();
  frames.shift()();
  resolveCatalog({ records: [{ id: 'test:example', methodological_review: {
    status: 'needs-reevaluation', reviewed_at: '2026-08-10',
    reassessment_reasons: ['Protocol changed.'], construct: 'Historical conclusion that must not appear'
  } }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(insertions.length, 1);
  assert.match(insertions[0], /Review needs reassessment/);
  assert.match(insertions[0], /2026-08-10/);
  assert.match(insertions[0], /Protocol changed\./);
  assert.doesNotMatch(insertions[0], /Historical conclusion that must not appear/);
});

test('100 render notifications coalesce to one frame and do not rewrite attributed rows', async () => {
  const source = await readFile('site/attribution.js', 'utf8');
  const frames = [], listeners = new Map();
  let writes = 0;
  const first = { classList: { add() {} }, set innerHTML(value) { writes++; }, get innerHTML() { return ''; } };
  const row = {
    dataset: {},
    querySelector(selector) {
      if (selector === '.eval-main') return { getAttribute: () => '#/eval/test%3Aexample' };
      if (selector === '.eval-context') return { querySelector: () => first };
      return null;
    }
  };
  const document = {
    querySelector: selector => selector === '#main' ? {} : null,
    querySelectorAll: selector => selector === '.eval-row' ? [row] : [],
    addEventListener: (event, callback) => listeners.set(event, callback)
  };
  const context = {
    document, location: { hash: '#/' },
    window: { addEventListener() {} },
    requestAnimationFrame: callback => frames.push(callback),
    FronteraEvalCatalogPromise: Promise.resolve({ records: [{ id: 'test:example', name: 'Example', organisation: 'Original authors', organisation_role: 'Original research by' }] }),
    fetch() { throw new Error('Duplicate catalogue request'); },
    setTimeout() { throw new Error('Unbounded timer scheduling'); }
  };
  vm.runInNewContext(source, context);
  for (let i = 0; i < 100; i++) listeners.get('fronteraeval:rendered')();
  assert.equal(frames.length, 1);
  await frames.shift()();
  assert.equal(writes, 1);
  for (let i = 0; i < 100; i++) listeners.get('fronteraeval:rendered')();
  assert.equal(frames.length, 1);
  await frames.shift()();
  assert.equal(writes, 1);
});
