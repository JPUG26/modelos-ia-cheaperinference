const $ = id => document.getElementById(id);
let data, visible = [], loading = false;
const price = value => value === null ? 'No publicado' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
const taskCost = value => value === null ? 'No publicado'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: value < 1 ? 3 : 2 }).format(value);
function valuePerDollar(row) {
  if (!Number.isFinite(row.index) || !Number.isFinite(row.ciCostPerTask) || row.ciCostPerTask <= 0) return null;
  const value = row.index / row.ciCostPerTask;
  return Number.isFinite(value) ? value : null;
}
function cell(text, className = '') { const td = document.createElement('td'); td.textContent = text; td.className = className; return td; }
function render() {
  if (!data) return;
  const query = $('search').value.trim().toLowerCase();
  visible = data.rows.filter(r => (!query || `${r.name} ${r.provider}`.toLowerCase().includes(query)) && (!$('effort').value || r.effort === $('effort').value));
  const key = $('sort').value;
  visible.sort((a, b) => key === 'name' ? a.name.localeCompare(b.name)
    : key === 'value' ? (b.valuePerDollar ?? -Infinity) - (a.valuePerDollar ?? -Infinity)
    : key === 'cost' ? (a.costPerTask ?? Infinity) - (b.costPerTask ?? Infinity)
    : ['index', 'discount'].includes(key) ? b[key] - a[key] : a[key] - b[key]);
  const bestValue = Math.max(-Infinity, ...visible.map(r => r.valuePerDollar ?? -Infinity));
  const fragment = document.createDocumentFragment();
  for (const row of visible) {
    const tr = document.createElement('tr');
    const name = cell(row.name, 'model'); const sub = document.createElement('small'); sub.textContent = row.provider; name.append(sub); tr.append(name);
    const effort = cell(''); const badge = document.createElement('span'); badge.className = `badge ${row.effort}`; badge.textContent = row.effort; effort.append(badge); tr.append(effort);
    tr.append(cell(row.index.toFixed(1), 'score'));
    for (const [value, list] of [[row.input, row.listInput], [row.output, row.listOutput]]) {
      const td = cell(price(value), 'price');
      if (list !== null && list !== value) { const old = document.createElement('s'); old.textContent = price(list); td.append(old); }
      tr.append(td);
    }
    const cost = cell('', 'task-cost'); const costValue = document.createElement('strong'); costValue.textContent = taskCost(row.costPerTask); cost.append(costValue);
    if (row.ciCostPerTask !== null) { const estimate = document.createElement('small'); estimate.textContent = `≈ ${taskCost(row.ciCostPerTask)} en CI`; cost.append(estimate); }
    tr.append(cost);
    const value = cell(row.valuePerDollar == null ? 'No disponible' : row.valuePerDollar.toLocaleString('es', { maximumFractionDigits: 1 }), 'task-value');
    if (row.valuePerDollar != null && row.valuePerDollar === bestValue) { const label = document.createElement('small'); label.textContent = 'Mejor valor'; value.append(label); }
    tr.append(value);
    tr.append(cell(`${row.discount}% off`, 'discount'));
    const links = cell('');
    for (const [label, url] of [['AA ↗', row.aaUrl], ['CI ↗', row.ciUrl]]) { const a = document.createElement('a'); a.textContent = label; a.href = url; a.target = '_blank'; a.rel = 'noreferrer'; links.append(a); }
    tr.append(links); fragment.append(tr);
  }
  $('rows').replaceChildren(fragment); $('empty').hidden = visible.length > 0;
  $('results').textContent = `${visible.length} de ${data.rows.length} variantes · ${new Set(data.rows.map(r => r.name)).size} modelos`;
  $('count').textContent = data.rows.length;
  $('best').textContent = data.rows.length ? Math.max(...data.rows.map(r => r.index)).toFixed(1) : '--';
  $('saving').textContent = data.rows.length ? `${Math.max(...data.rows.map(r => r.discount))}%` : '--';
  $('updated').textContent = new Date(data.updatedAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'medium' });
  $('export').disabled = !visible.length;
}
async function load() {
  if (loading) return; loading = true; $('refresh').disabled = true; $('refresh').textContent = 'Consultando...';
  try {
    const response = await fetch('/api/models'); const result = await response.json();
    if (!response.ok || !Array.isArray(result.rows)) throw new Error(result.error || 'Respuesta no válida.');
    // An already-running server may still return snapshots from before this field was added.
    data = { ...result, rows: result.rows.map(row => ({ ...row, valuePerDollar: valuePerDollar(row) })) }; render();
    $('status').className = result.stale ? 'warning' : 'success';
    $('status').textContent = result.stale ? `Datos anteriores. No se pudo actualizar: ${result.error}` : `Fuentes verificadas: ${result.aaCount} evaluaciones AA y ${result.ciCount} modelos CI. Solo se muestran coincidencias con web-search e índice > 32. Precios públicos redondeados.`;
  } catch (error) {
    $('status').className = 'warning'; $('status').textContent = `${data ? 'Se conserva la última consulta. ' : 'No se pudieron obtener datos. '}${error.message} Reintento automático en 5 minutos.`;
  } finally { loading = false; $('refresh').disabled = false; $('refresh').textContent = 'Actualizar datos ↻'; }
}
$('search').addEventListener('input', render);
for (const id of ['effort', 'sort']) $(id).addEventListener('change', render);
$('refresh').addEventListener('click', load);
$('export').addEventListener('click', () => {
  const rows = [['Modelo', 'Proveedor', 'Esfuerzo', 'AA Index', 'Entrada USD/1M', 'Salida USD/1M', 'Costo por tarea AA USD (lista)', 'Costo por tarea CI estimado USD', 'AA Index / USD por tarea CI estimado', 'Descuento publicado %', 'Consulta UTC', 'Fuente AA', 'Fuente CI'], ...visible.map(r => [r.name, r.provider, r.effort, r.index, r.input, r.output, r.costPerTask, r.ciCostPerTask, r.valuePerDollar, r.discount, data.updatedAt, r.aaUrl, r.ciUrl])];
  const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'prisma-modelos.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
load(); setInterval(load, 300000);
