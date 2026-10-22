#!/usr/bin/env node
/* ============================================================
   Release gate: everything that can be proven without a device.

   1. static checks (imports, precache list, manifest, theme tokens)
   2. every JS source parses
   3. www/ exists, has no empty files, and is not stale

   Run it before `cap sync`, `electron-builder`, or any store upload.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, runChecks } from './checks.mjs';

const OUT = path.join(ROOT, 'www');

const { errors, warnings } = runChecks();

/* ---------- www/ freshness ---------- */

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

if (!fs.existsSync(OUT)) {
  errors.push('www/ does not exist — run `npm run build` first');
} else {
  for (const file of walk(OUT)) {
    const rel = path.relative(OUT, file);
    const relPosix = rel.split(path.sep).join('/');

    const stat = fs.statSync(file);
    if (stat.size === 0) errors.push(`www/${relPosix} is empty`);

    const source = path.join(ROOT, relPosix);
    if (!fs.existsSync(source)) {
      warnings.push(`www/${relPosix} has no matching source file (leftover from an older build?)`);
    } else if (fs.statSync(source).mtimeMs > stat.mtimeMs + 1000) {
      errors.push(`www/${relPosix} is stale — run \`npm run build\``);
    }
  }
}

/* ---------- report ---------- */

if (warnings.length) {
  console.log('warnings:');
  for (const w of warnings) console.log('  ! ' + w);
}

if (errors.length) {
  console.error(`\nverify FAILED (${errors.length}):`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}

console.log('verify OK — sources parse, references resolve, bundle is current');
