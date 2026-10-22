/* ============================================================
   Shared static checks for the Stack bundle.
   Used by scripts/build.mjs (before copying) and scripts/verify.mjs.

   The point is to catch, before anything ships, the class of bug
   that only shows up once: a renamed file, a typo'd import, a
   manifest pointing at an icon nobody generated.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const JS_EXT = new Set(['.js', '.mjs', '.cjs']);

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

/** Files in a directory that match one of the given extensions. */
function sourceFiles(dir, exts) {
  return walk(path.join(ROOT, dir)).filter((f) => exts.has(path.extname(f)));
}

/**
 * Resolve a URL found in HTML/JS/manifest to a path on disk.
 * Returns null for anything that is not a same-directory relative file
 * (absolute paths, http(s), data:, mailto:, #anchors, query-only links).
 */
function localPath(root, url) {
  const clean = String(url).split('#')[0].split('?')[0].trim();
  if (!clean) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) return null; // scheme: http:, data:, mailto: …
  if (clean.startsWith('//') || clean.startsWith('/')) return null; // site-absolute
  const abs = path.resolve(root, clean);
  return abs;
}

export function runChecks() {
  const errors = [];
  const warnings = [];
  const reported = new Set();

  function must(label, relFromRoot) {
    const key = label + '|' + relFromRoot;
    if (reported.has(key)) return;
    reported.add(key);
    if (!fs.existsSync(path.join(ROOT, relFromRoot))) {
      errors.push(`${label} → missing file "${relFromRoot}"`);
    }
  }

  /* ---------- 1. every source file must parse ---------- */
  const syntaxTargets = [
    ...sourceFiles('js', new Set(['.js'])),
    ...sourceFiles('scripts', new Set(['.mjs'])),
    ...sourceFiles('electron', new Set(['.cjs', '.mjs', '.js']))
  ];
  for (const file of syntaxTargets) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (res.status !== 0) {
      errors.push(`syntax error in ${rel}:\n${(res.stderr || '').trim()}`);
    }
  }

  /* ---------- 2. index.html must only reference files that exist ---------- */
  const htmlPath = path.join(ROOT, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    errors.push('index.html is missing');
  } else {
    const html = fs.readFileSync(htmlPath, 'utf8');

    const refRe = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
    let m;
    while ((m = refRe.exec(html))) {
      const abs = localPath(ROOT, m[1]);
      if (abs && !fs.existsSync(abs)) errors.push(`index.html references missing file "${m[1]}"`);
    }

    // the service worker registration must point at a real file too
    const swRe = /serviceWorker\s*\.\s*register\s*\(\s*["']([^"']+)["']/;
    const swMatch = swRe.exec(html);
    if (!swMatch) {
      warnings.push('index.html does not register a service worker');
    } else {
      const abs = localPath(ROOT, swMatch[1]);
      if (abs && !fs.existsSync(abs)) errors.push(`service worker "${swMatch[1]}" is missing`);
    }
  }

  /* ---------- 3. every ES module import must resolve ---------- */
  for (const file of sourceFiles('js', new Set(['.js']))) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const patterns = [
      /\bfrom\s*["'](\.{1,2}\/[^"']+)["']/g, // import x from './y.js'
      /(^|[\s;])import\s*["'](\.{1,2}\/[^"']+)["']/g // import './y.js'
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(src))) {
        const spec = m[1] || m[2];
        const abs = path.resolve(path.dirname(file), spec);
        if (!fs.existsSync(abs)) errors.push(`${rel} imports missing module "${spec}"`);
      }
    }
  }

  /* ---------- 4. the service worker's precache list must exist ---------- */
  const swPath = path.join(ROOT, 'sw.js');
  if (!fs.existsSync(swPath)) {
    errors.push('sw.js is missing');
  } else {
    const sw = fs.readFileSync(swPath, 'utf8');
    const cacheMatch = /const\s+CACHE\s*=\s*["']([^"']+)["']/.exec(sw);
    if (!cacheMatch) errors.push('sw.js does not declare a CACHE name (releases cannot be versioned)');

    const urlRe = /["'](\.\/[^"']*)["']/g;
    let m;
    while ((m = urlRe.exec(sw))) {
      const url = m[1];
      if (url === './') continue;
      must('sw.js precache', url.slice(2));
    }
  }

  /* ---------- 5. the web manifest must be complete and honest ---------- */
  const mfPath = path.join(ROOT, 'manifest.webmanifest');
  if (!fs.existsSync(mfPath)) {
    errors.push('manifest.webmanifest is missing');
  } else {
    let mf = null;
    try {
      mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
    } catch (e) {
      errors.push(`manifest.webmanifest is not valid JSON: ${e.message}`);
    }
    if (mf) {
      for (const key of ['name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color']) {
        if (!mf[key]) errors.push(`manifest.webmanifest is missing "${key}"`);
      }
      if (mf.start_url) must('manifest start_url', path.resolve(ROOT, String(mf.start_url).split('?')[0]).replace(ROOT + path.sep, '').replace(/\\/g, '/'));

      if (!Array.isArray(mf.icons) || mf.icons.length === 0) {
        errors.push('manifest.webmanifest declares no icons');
      } else {
        for (const icon of mf.icons) {
          if (!icon.src || !icon.sizes || !icon.type) {
            errors.push('manifest icon entry is missing src/sizes/type');
            continue;
          }
          const abs = localPath(ROOT, icon.src);
          if (abs && !fs.existsSync(abs)) errors.push(`manifest icon "${icon.src}" is missing`);
        }
        const hasPng512 = mf.icons.some((i) => i.sizes === '512x512' && /image\/png/.test(i.type));
        if (!hasPng512) errors.push('manifest needs a 512x512 PNG icon (required by Play / App Store / desktop installers)');
        const hasMaskable = mf.icons.some((i) => String(i.purpose || '').includes('maskable'));
        if (!hasMaskable) warnings.push('manifest has no icon with purpose "maskable" (Android will letterbox your icon)');
      }
    }
  }

  /* ---------- 6. shared brand tokens must agree ---------- */
  const cssPath = path.join(ROOT, 'css', 'game.css');
  const htmlForTheme = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
  if (fs.existsSync(cssPath)) {
    const css = fs.readFileSync(cssPath, 'utf8');
    const cssBg = /--bg:\s*(#[0-9a-fA-F]{6})/.exec(css);
    const metaTheme = /name="theme-color"\s+content="(#[0-9a-fA-F]{6})"/.exec(htmlForTheme);
    if (cssBg && metaTheme && cssBg[1].toLowerCase() !== metaTheme[1].toLowerCase()) {
      errors.push(`theme-color ${metaTheme[1]} does not match --bg ${cssBg[1]}`);
    }
    if (cssBg && htmlForTheme && mfPath && fs.existsSync(mfPath)) {
      try {
        const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
        if (mf.background_color && mf.background_color.toLowerCase() !== cssBg[1].toLowerCase()) {
          errors.push(`manifest background_color ${mf.background_color} does not match --bg ${cssBg[1]}`);
        }
      } catch { /* already reported above */ }
    }
  }

  /* ---------- 7. desktop build icon ---------- */
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const icon = pkg.build && pkg.build.win && pkg.build.win.icon;
    if (icon && !fs.existsSync(path.join(ROOT, icon))) {
      warnings.push(`desktop build icon "${icon}" is missing — electron-builder will fail on Windows`);
    }
  } catch (e) {
    errors.push(`package.json is not valid JSON: ${e.message}`);
  }

  return { errors, warnings };
}
