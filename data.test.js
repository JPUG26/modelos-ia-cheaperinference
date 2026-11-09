import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { compare, arrayField, payload } from './data.js';
const model = { slug: 'gpt-6-low', release: { slug: 'gpt-6', name: 'GPT-6' }, effort: { slug: 'low' }, intelligenceIndex: 33,
  intelligenceIndexCostPerTask: { cost: { total: 1.25 } } };
const catalog = { slug: 'gpt-6', name: 'gpt-6', kind: 'text', priceUnit: 'M', capabilities: ['web-search'], input: '$$1.25', output: '$$5.00', listInput: '$$2.00', listOutput: '$$8.00', savings: 38 };
test('joins exact release with real effort and published discount', () => {
  const { rows } = compare([model], [catalog]);
  assert.equal(rows.length, 1); assert.equal(rows[0].input, 1.25); assert.equal(rows[0].discount, 38); assert.equal(rows[0].effort, 'low');
});
test('extracts AA cost per task and projects it with the published discount', () => {
  const { rows } = compare([model], [catalog]);
  assert.equal(rows[0].costPerTask, 1.25);
  assert.equal(rows[0].ciCostPerTask.toFixed(4), '0.7750');
  assert.equal(compare([{ ...model, intelligenceIndexCostPerTask: 2 }], [catalog]).rows[0].costPerTask, 2);
  assert.equal(compare([{ ...model, intelligenceIndexCostPerTask: null }], [catalog]).rows[0].costPerTask, null);
  assert.equal(compare([{ ...model, intelligenceIndexCostPerTask: null }], [catalog]).rows[0].ciCostPerTask, null);
});
test('calculates value per dollar for each effort without dividing by zero', () => {
  const variants = [model, { ...model, slug: 'gpt-6-high', effort: { slug: 'high' }, intelligenceIndex: 44, intelligenceIndexCostPerTask: 2 }];
  const { rows } = compare(variants, [catalog]);
  assert.equal(rows.find(r => r.effort === 'low').valuePerDollar, 33 / 0.775);
  assert.equal(rows.find(r => r.effort === 'high').valuePerDollar, 44 / (2 * 0.62));
  assert.equal(compare([{ ...model, intelligenceIndexCostPerTask: null }], [catalog]).rows[0].valuePerDollar, null);
  assert.equal(compare([{ ...model, intelligenceIndexCostPerTask: 0 }], [catalog]).rows[0].valuePerDollar, null);
  assert.equal(compare([model], [{ ...catalog, savings: 100 }]).rows[0].valuePerDollar, null);
  assert.equal(compare([model], [{ ...catalog, savings: 110 }]).rows[0].valuePerDollar, null);
});
test('client calculates value from a snapshot returned by an older server', async () => {
  const source = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: '', addEventListener() {}, replaceChildren() {} });
      return elements.get(id);
    },
    createDocumentFragment: () => ({ append() {} }),
    createElement: () => ({ append() {}, set textContent(value) { this.text = value; } }),
  };
  const snapshot = { rows: [{ name: 'GPT-6', provider: 'OpenAI', effort: 'low', index: 33, ciCostPerTask: 0.775, costPerTask: 1.25, input: 1, output: 2, listInput: null, listOutput: null, discount: 38, aaUrl: '', ciUrl: '' }], updatedAt: '2026-01-01T00:00:00Z' };
  const context = { document, fetch: async () => ({ ok: true, json: async () => snapshot }), setInterval() {}, setTimeout() {}, Intl, Date, Math, Number, URL, Blob };
  runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runInNewContext('data.rows[0].valuePerDollar', context), 33 / 0.775);
  assert.equal(runInNewContext('valuePerDollar({ index: 33, ciCostPerTask: 0 })', context), null);
  assert.equal(runInNewContext('valuePerDollar({ index: 33, ciCostPerTask: null })', context), null);
});
test('strict threshold and web capability', () => {
  assert.equal(compare([{ ...model, intelligenceIndex: 32 }], [catalog]).rows.length, 0);
  assert.equal(compare([model], [{ ...catalog, capabilities: ['tool-use'] }]).rows.length, 0);
  assert.equal(compare([{ ...model, effort: undefined }], [catalog]).rows.length, 0);
});
test('rejects fuzzy, ambiguous, invalid-price and non-token matches', () => {
  assert.equal(compare([model], [{ ...catalog, slug: 'gpt-6-pro', name: 'gpt-6-pro' }]).rows.length, 0);
  assert.equal(compare([model], [catalog, catalog]).rows.length, 0);
  assert.equal(compare([model], [{ ...catalog, input: 'N/A' }]).rows.length, 0);
  assert.equal(compare([model], [{ ...catalog, priceUnit: 'K' }]).rows.length, 0);
});
test('extracts streamed text and nested arrays with escaped brackets', () => {
  const text = 'abc"rows":[{"name":"a]b\\\"","nested":[1,2]}]tail';
  assert.equal(arrayField(text, 'rows')[0].nested.length, 2);
  const html = `self.__next_f.push([1,${JSON.stringify(text)}])`;
  assert.equal(payload(html), text);
  assert.throws(() => arrayField('nothing', 'rows'));
});
