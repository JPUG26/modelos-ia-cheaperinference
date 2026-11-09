import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { synchronize } from './data.js';

const port = Number(process.env.PORT || 3000);
const TTL = 5 * 60 * 1000;
let snapshot, pending, lastError = null;
async function refresh() {
  if (pending) return pending;
  pending = synchronize().then(data => { snapshot = data; lastError = null; return data; })
    .catch(error => { lastError = error.message; throw error; }).finally(() => { pending = null; });
  return pending;
}
const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/cost.css': ['cost.css', 'text/css; charset=utf-8'] };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (url.pathname === '/api/models') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!snapshot || Date.now() - Date.parse(snapshot.updatedAt) >= TTL) await refresh();
      res.end(JSON.stringify({ ...snapshot, stale: Boolean(lastError), error: lastError, refreshInterval: TTL }));
    } catch (error) {
      res.statusCode = snapshot ? 200 : 502;
      res.end(JSON.stringify(snapshot ? { ...snapshot, stale: true, error: error.message, refreshInterval: TTL } : { error: error.message }));
    }
    return;
  }
  if (!files[url.pathname]) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const [file, type] = files[url.pathname];
    res.setHeader('Content-Type', type);
    res.end(await readFile(new URL(`./public/${file}`, import.meta.url)));
  } catch { res.writeHead(500); res.end('Error al servir la aplicación.'); }
}).listen(port, '127.0.0.1', () => console.log(`Observatorio disponible en http://localhost:${port}`));
