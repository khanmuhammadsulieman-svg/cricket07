#!/usr/bin/env node
/**
 * Builds the static `dist/` output directory for Vercel (and any static host).
 * Stages `/site`, `/mods`, `/LICENSES`, `/downloads`, and any precompiled
 * WebAssembly runtime under `/engine/build_web/www` without requiring Python.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE_DIR = path.join(ROOT, 'site');
const MODS_DIR = path.join(ROOT, 'mods');
const LICENSES_DIR = path.join(ROOT, 'LICENSES');
const ENGINE_WEB_BUILD = path.join(ROOT, 'engine', 'build_web', 'www');

const IGNORED_NAMES = new Set(['.DS_Store', '__pycache__', 'Thumbs.db']);

function copyDirRecursive(src, dest, skipPredicate) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (IGNORED_NAMES.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (skipPredicate && skipPredicate(srcPath, entry)) continue;
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, skipPredicate);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function stageMods() {
  if (!fs.existsSync(MODS_DIR)) return 0;
  let stagedCount = 0;
  for (const entry of fs.readdirSync(MODS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packDir = path.join(MODS_DIR, entry.name);
    const manifestPath = path.join(packDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const targetDir = path.join(DIST, 'play', 'mods', entry.name);
    fs.mkdirSync(targetDir, { recursive: true });

    const filesToCopy = ['manifest.json'];
    if (Array.isArray(manifest.parts) && manifest.parts.length > 0) {
      for (const part of manifest.parts) {
        if (part && typeof part.file === 'string') {
          filesToCopy.push(part.file);
        }
      }
    } else if (typeof manifest.file === 'string') {
      filesToCopy.push(manifest.file);
    }

    for (const fileName of filesToCopy) {
      const srcFile = path.join(packDir, fileName);
      if (!fs.existsSync(srcFile)) {
        throw new Error(`Missing mod pack file: ${srcFile}`);
      }
      fs.copyFileSync(srcFile, path.join(targetDir, fileName));
      stagedCount += 1;
    }
  }
  return stagedCount;
}

function stageEngineRuntime() {
  if (!fs.existsSync(ENGINE_WEB_BUILD)) return 0;
  const targetDir = path.join(DIST, 'play', 'build');
  let copied = 0;
  for (const entry of fs.readdirSync(ENGINE_WEB_BUILD, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.startsWith('recomp.')) continue;
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(path.join(ENGINE_WEB_BUILD, entry.name), path.join(targetDir, entry.name));
    copied += 1;
  }
  return copied;
}

function stageLicenses() {
  if (!fs.existsSync(LICENSES_DIR)) return 0;
  const fontsDir = path.join(DIST, 'assets', 'fonts');
  fs.mkdirSync(fontsDir, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(LICENSES_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.txt')) {
      fs.copyFileSync(path.join(LICENSES_DIR, entry.name), path.join(fontsDir, entry.name));
      copied += 1;
    }
  }
  return copied;
}

function stageDownloads() {
  const downloadsDir = path.join(DIST, 'downloads');
  fs.mkdirSync(downloadsDir, { recursive: true });

  const licenseSrc = path.join(ROOT, 'LICENSE');
  if (fs.existsSync(licenseSrc)) {
    fs.copyFileSync(licenseSrc, path.join(downloadsDir, 'LICENSE.txt'));
  }

  const customizeSrc = path.join(ROOT, 'content', 'CUSTOMIZE-WITH-AI.md');
  if (fs.existsSync(customizeSrc)) {
    fs.copyFileSync(customizeSrc, path.join(downloadsDir, 'CUSTOMIZE-WITH-AI.md'));
  }
}

function configurePlayPublicFlag() {
  const playIndexPath = path.join(DIST, 'play', 'index.html');
  if (!fs.existsSync(playIndexPath)) return false;

  const hostedManifest = path.join(DIST, 'play', 'game', 'manifest.json');
  const hasHostedGame = fs.existsSync(hostedManifest);
  if (!hasHostedGame) {
    const html = fs.readFileSync(playIndexPath, 'utf8');
    const updated = html.replace(
      '<script>window.C07_PUBLIC=true;</script>',
      '<script>window.C07_PUBLIC=false;</script>',
    );
    fs.writeFileSync(playIndexPath, updated, 'utf8');
  }
  return hasHostedGame;
}

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  copyDirRecursive(SITE_DIR, DIST);
  const modFiles = stageMods();
  const runtimeFiles = stageEngineRuntime();
  const licenseFiles = stageLicenses();
  stageDownloads();
  const hasHostedGame = configurePlayPublicFlag();

  console.log(
    `Built Vercel static bundle in dist/ (${modFiles} mod pack files, ${runtimeFiles} runtime files, ${licenseFiles} font license files, C07_PUBLIC=${hasHostedGame}).`,
  );
}

main();
