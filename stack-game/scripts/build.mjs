#!/usr/bin/env node
/* ============================================================
   Build the distributable web bundle into www/.

   www/ is the single artefact every target consumes:
     · Capacitor (Android / iOS) copies it into the native shell
     · Electron loads it through the app:// protocol
     · a static host (GitHub Pages, itch.io) serves it as a WebGL build

   Nothing is bundled or transpiled — the game is already plain ES
   modules with zero dependencies — so the "build" is really
   validation plus an exact copy. Validation runs first: if a file
   is missing, the build fails instead of shipping a bundle that
   throws in a browser on someone's phone.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, runChecks } from './checks.mjs';

const OUT = path.join(ROOT, 'www');
const COPY = ['index.html', 'sw.js', 'manifest.webmanifest', 'css', 'js', 'icons'];
const SKIP = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

const { errors, warnings } = runChecks();

if (warnings.length) {
  console.log('warnings:');
  for (const w of warnings) console.log('  ! ' + w);
}
if (errors.length) {
  console.error('\nbuild failed — fix these first:');
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let files = 0;
let bytes = 0;

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTree(from, to);
    } else {
      const stat = fs.statSync(from);
      if (stat.size === 0) {
        throw new Error(`refusing to ship empty file: ${path.relative(ROOT, from).replace(/\\/g, '/')}`);
      }
      fs.copyFileSync(from, to);
      files += 1;
      bytes += stat.size;
    }
  }
}

for (const item of COPY) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) {
    console.error(`build failed — missing source "${item}"`);
    process.exit(1);
  }
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyTree(src, path.join(OUT, item));
  } else {
    if (stat.size === 0) {
      console.error(`build failed — refusing to ship empty file: ${item}`);
      process.exit(1);
    }
    fs.copyFileSync(src, path.join(OUT, item));
    files += 1;
    bytes += stat.size;
  }
}

console.log(`www/ built — ${files} files, ${(bytes / 1024).toFixed(1)} KB`);
console.log('next: npm start (preview), npx cap sync android, npm run desktop:dev');
