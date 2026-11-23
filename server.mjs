import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

const SITE_DIR = path.join(__dirname, 'site');
const MODS_DIR = path.join(__dirname, 'mods');
const LICENSES_DIR = path.join(__dirname, 'LICENSES');
const ENGINE_WEB_BUILD = path.join(__dirname, 'engine', 'build_web', 'www');
const PLAY_GAME_MANIFEST = path.join(SITE_DIR, 'play', 'game', 'manifest.json');

// Security & Cross-Origin Isolation headers matching vercel.json
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use('/play', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache');
  next();
});

// Serve /play/ index dynamically toggling C07_PUBLIC only when hosted manifest exists,
// so local folder import works seamlessly when game chunks are not staged yet.
app.get(['/play', '/play/', '/play/index.html'], (req, res, next) => {
  if (req.path === '/play') {
    return res.redirect(301, '/play/');
  }
  const indexPath = path.join(SITE_DIR, 'play', 'index.html');
  fs.readFile(indexPath, 'utf8', (err, html) => {
    if (err) return next(err);
    const hasManifest = fs.existsSync(PLAY_GAME_MANIFEST);
    const output = hasManifest
      ? html
      : html.replace('<script>window.C07_PUBLIC=true;</script>', '<script>window.C07_PUBLIC=false;</script>');
    res.type('html').send(output);
  });
});

// Mount mod packs from /mods/* under /play/mods/* (as tools/build_site.py stages them)
app.use('/play/mods', express.static(MODS_DIR, { acceptRanges: true }));

// If compiled WebAssembly runtime exists in engine/build_web/www/, serve it at /play/build/*
app.use('/play/build', express.static(ENGINE_WEB_BUILD, { acceptRanges: true }));

// Mount downloads & font license files referenced by site/index.html
app.get('/downloads/LICENSE.txt', (_req, res) => {
  res.sendFile(path.join(__dirname, 'LICENSE'));
});
app.get('/downloads/CUSTOMIZE-WITH-AI.md', (_req, res) => {
  res.sendFile(path.join(__dirname, 'content', 'CUSTOMIZE-WITH-AI.md'));
});
app.use('/assets/fonts', express.static(LICENSES_DIR));

// Serve the entire original /site directory (landing page, /links/, /play/, assets, teams.json, prompts.json)
app.use(express.static(SITE_DIR, { acceptRanges: true }));

app.listen(PORT, HOST, () => {
  console.log(`Cricket 07 (original repository) serving on http://${HOST}:${PORT}`);
});
