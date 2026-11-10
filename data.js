import { createHash, createDecipheriv } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export const SOURCES = { aa: 'https://artificialanalysis.ai/models', ci: 'https://cheaperinference.com/' };
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const MIN_INDEX = 30;

export function payload(html) {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
    .map(m => JSON.parse(m[1])).join('');
}

export function arrayField(text, key) {
  const marker = `"${key}":[`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`La fuente ya no publica ${key}.`);
  const begin = start + marker.length - 1;
  let depth = 0, quoted = false, escaped = false;
  for (let i = begin; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return JSON.parse(text.slice(begin, i + 1));
  }
  throw new Error(`Datos incompletos: ${key}.`);
}

export const normalize = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const money = value => typeof value === 'string' && /^\$+[\d,.]+$/.test(value)
  ? Number(value.replace(/[$,]/g, '')) : null;
// AA publishes the weighted average cost per Intelligence Index task at list prices.
const perTaskCost = value => Number.isFinite(value) ? value
  : Number.isFinite(value?.cost?.total) ? value.cost.total : null;

export function compare(models, catalog) {
  const eligible = catalog.filter(m => m.kind === 'text' && m.priceUnit === 'M');
  const rows = [], unmatched = [];
  for (const m of models) {
    const effort = m.effort?.slug;
    if (!EFFORTS.includes(effort) || !Number.isFinite(m.intelligenceIndex) || m.intelligenceIndex <= MIN_INDEX) continue;
    // Match exact release identities, never fuzzy family names or estimated scores.
    const identities = [m.release?.slug, m.release?.name].filter(Boolean).map(normalize);
    const matches = eligible.filter(c => identities.includes(normalize(c.slug)) || identities.includes(normalize(c.name)));
    if (matches.length !== 1) { unmatched.push(m.slug); continue; }
    const c = matches[0];
    const input = money(c.input), output = money(c.output);
    if (input === null || output === null || !Number.isFinite(c.savings)) continue;
    const costPerTask = perTaskCost(m.intelligenceIndexCostPerTask);
    // The catalog exposes only input/output prices, so cache prices are assumed to scale with the same discount.
    const estimatedCost = costPerTask === null ? null : costPerTask * (1 - c.savings / 100);
    const ciCostPerTask = Number.isFinite(estimatedCost) && estimatedCost >= 0 ? estimatedCost : null;
    const ratio = ciCostPerTask > 0 ? m.intelligenceIndex / ciCostPerTask : null;
    const valuePerDollar = Number.isFinite(ratio) ? ratio : null;
    rows.push({ id: m.slug, name: m.release.name, provider: c.provider, effort, index: m.intelligenceIndex,
      input, output, listInput: money(c.listInput), listOutput: money(c.listOutput), discount: c.savings,
      costPerTask, ciCostPerTask, valuePerDollar,
      webSearch: c.capabilities?.includes('web-search') === true,
      context: c.contextLength, aaUrl: `https://artificialanalysis.ai/models/${encodeURIComponent(m.slug)}`,
      ciUrl: `https://cheaperinference.com/models/${encodeURIComponent(c.slug)}` });
  }
  return { rows: rows.sort((a, b) => b.index - a.index), unmatched };
}

async function request(url, binary = false) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'ModelObservatory/1.0', 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  return binary ? Buffer.from(await response.arrayBuffer()) : response.text();
}

export async function synchronize() {
  const [aaHtml, ciHtml] = await Promise.all([request(SOURCES.aa), request(SOURCES.ci)]);
  const aa = payload(aaHtml), ci = payload(ciHtml);
  const manifests = [...aa.matchAll(/"manifest":(\{"path":"\/data\/[^"\n]+","key":"[a-f0-9]{64}"\})/g)].map(m => JSON.parse(m[1]));
  if (!manifests.length) throw new Error('Artificial Analysis cambió el formato de publicación.');
  let models;
  // The public page supplies these manifests and keys to its own browser client.
  for (const manifest of manifests) {
    const bytes = await request(new URL(manifest.path, SOURCES.aa), true);
    const key = Buffer.from(manifest.key, 'hex');
    const iv = createHash('sha256').update(key).digest().subarray(0, 12);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(bytes.subarray(-16));
    const decoded = JSON.parse(gunzipSync(Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()])).toString('utf8'));
    if (Array.isArray(decoded.models)) { models = decoded.models; break; }
  }
  if (!models?.length) throw new Error('No se encontró el catálogo de índices de Artificial Analysis.');
  const catalog = arrayField(ci, 'rows');
  if (!catalog.length) throw new Error('Cheaper Inference devolvió un catálogo vacío.');
  return { ...compare(models, catalog), updatedAt: new Date().toISOString(), aaCount: models.length,
    ciCount: catalog.length, sources: SOURCES,
    pricePrecision: 'Precios redondeados publicados en el catálogo público, USD por millón de tokens. Coste por tarea: media ponderada de AA con precios de lista; la cifra en CI aplica el descuento publicado.' };
}
