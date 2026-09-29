// Serves the README stage on 127.0.0.1 (ES modules and fonts need http, not file://).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 5178);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };

http
  .createServer(async (req, res) => {
    const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`stage on http://127.0.0.1:${port}/stage.html`));
