import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const host = process.env.HOST || '127.0.0.1';
const startPort = Number(process.env.PORT || 5173);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function resolveRequest(url) {
  const pathname = decodeURIComponent(new URL(url, `http://${host}`).pathname);
  const candidate = resolve(join(root, pathname));

  if (!candidate.startsWith(root)) return null;
  if (!existsSync(candidate)) return null;

  const stats = statSync(candidate);
  return stats.isDirectory() ? join(candidate, 'index.html') : candidate;
}

const server = createServer((req, res) => {
  const filePath = resolveRequest(req.url || '/');

  if (!filePath || !existsSync(filePath)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'content-type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store'   // 开发环境禁缓存，避免 ES module 被浏览器启发式缓存
  });
  createReadStream(filePath).pipe(res);
});

function listen(port) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && port < startPort + 100) {
      listen(port + 1);
      return;
    }
    throw error;
  });

  server.listen(port, host, () => {
    console.log(`Blade game running at http://${host}:${port}`);
  });
}

listen(startPort);
