// Static file serving for the game client. Only an explicit allow-list of the
// repo root is reachable; everything else (server/, design/, tools/,
// assets/raw/, dotfiles, traversal) is a plain 404.
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const ROOT_FILES = new Set(['index.html', 'manifest.webmanifest', 'sw.js']);
const ROOT_DIRS = new Set(['css', 'js', 'assets']);
const BLOCKED_PREFIXES = [['assets', 'raw']];

const CODE_CACHE = 'public, max-age=3600, stale-while-revalidate=86400';
const ASSET_CACHE = 'public, max-age=604800, stale-while-revalidate=86400';

// Cloudflare's zone Browser Cache TTL overrides origin values shorter than its own.
function cacheControlFor(segs) {
  const dir = segs.length > 1 ? segs[0] : null;
  if (dir === 'js' || dir === 'css') return CODE_CACHE;
  if (dir === 'assets') return ASSET_CACHE;
  return 'no-cache';
}

/** Map a raw request path to safe path segments, or null if not servable. */
export function staticSegments(rawPath) {
  if (rawPath === '/' || rawPath === '') return ['index.html'];
  if (!rawPath.startsWith('/')) return null;
  const parts = rawPath.slice(1).split('/');
  const segs = [];
  for (const p of parts) {
    let s;
    try { s = decodeURIComponent(p); } catch { return null; }
    // Empty, ".", "..", dotfiles, and anything that could smuggle a separator.
    if (!s || s.startsWith('.') || /[\\/\0:]/.test(s)) return null;
    segs.push(s);
  }
  if (segs.length === 1) return ROOT_FILES.has(segs[0]) ? segs : null;
  if (!ROOT_DIRS.has(segs[0])) return null;
  for (const b of BLOCKED_PREFIXES) {
    if (b.every((x, i) => segs[i] === x)) return null;
  }
  return segs;
}

export function makeStatic(root) {
  let realRoot = null;
  return async function serveStatic(req, res, rawPath) {
    const segs = staticSegments(rawPath);
    if (!segs) return false;
    realRoot ??= await realpath(root);
    let file, info;
    try {
      file = await realpath(join(realRoot, ...segs));
      // Symlinks must not lead outside the root either.
      if (!file.startsWith(realRoot + sep)) return false;
      info = await stat(file);
    } catch { return false; }
    if (!info.isFile()) return false;

    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': cacheControlFor(segs),
      'ETag': etag,
      'Last-Modified': info.mtime.toUTCString(),
      'X-Content-Type-Options': 'nosniff',
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }
    headers['Content-Length'] = info.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return true; }
    const stream = createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    return true;
  };
}
