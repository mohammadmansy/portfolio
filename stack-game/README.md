# Stack — 3D Tower Builder

A one-tap 3D tower builder. Each block sweeps in on an axis, you tap to drop it,
and whatever overhangs the block below gets sliced off — so the tower drifts,
narrows, and eventually kills you. Pure canvas, zero dependencies, ~90 KB.

| Target | Artefact |
| --- | --- |
| **Google Play** | `release/Stack-1.0-aab.aab` ← the upload file |
| Test on a real phone | `release/Stack-1.0.apk` |
| Web / PWA (installable, offline) | `www/` on any static host |
| Windows / macOS / Linux | NSIS installer, DMG, AppImage, deb |

---

## Run it

```bash
npm install
npm run build        # validates sources + writes www/
npm start            # http://localhost:4173
npm run verify       # release gate, no browser needed
```

`npm run build` refuses to produce a bundle that references a missing file, has a
broken import, or ships an empty asset. `npm run verify` runs the same gate plus
a staleness check — run it before every upload.

---

## Project layout

```
index.html            shell: canvas, HUD, overlays
css/game.css          tokens + layout (mobile-first, safe-area aware)
js/config.js          ← all tuning lives here
js/game.js            simulation + state machine (MENU/PLAYING/PAUSED/OVER)
js/renderer.js        isometric software renderer, painter's sort
js/input.js           pointer + keyboard, one action = drop
js/audio.js           Web Audio SFX (no audio files to ship)
js/storage.js         localStorage wrapper
js/ui.js              overlays, HUD, toggles
js/main.js            fixed-timestep loop + wiring
sw.js                 offline app shell
manifest.webmanifest  PWA manifest
scripts/              build + release gate
android/              ← Capacitor project, source, committed
electron/             desktop shell (app:// protocol)
icons/                PWA + favicon assets
store/                Google Play listing assets
assets/               source art for native icons
www/                  build output (git-ignored)
release/              built AAB + APK (git-ignored)
```

### Tuning the game

Everything gameplay-related is in `js/config.js`. The curve that matters:

```js
export const DIFFICULTY = {
  base: 1.35,        // speed at level 1
  perLevel: 0.045,   // added per level
  cap: 1.45,         // max added (reached at ~level 32)
  tierEvery: 5       // every 5 levels: hue + glow "tier" moment
};
```

`BLOCK.RANGE` is the sweep half-width and `BLOCK.PERFECT` is the snap tolerance
in world units — widen it to be kinder, narrow it to be meaner.

Level design rules the game follows, worth keeping if you extend it:

- **Physics runs on a fixed 120 Hz timestep** (`main.js`), so a 60 Hz phone and
  a 144 Hz monitor play identically.
- **The sweep is relative to the block below**, not to world origin, so a
  drifted tower still stacks correctly. Changing this breaks the game.
- **Axis alternates every level** (`x`, `z`, `x`…) which is what makes the
  tower spiral instead of leaning one way.
- **Slicing is axis-naive** (`min`/`max` of the two spans) — the overhang falls
  off on the axis you were sweeping, which reads correctly in isometric view.
- **Dropping never kills the run** if the moving block still overlaps the block
  below; zero overlap = crash. No random deaths.

---

## 1. Google Play

### 1.1 What is already configured

This repo ships a ready `android/` project. Do not regenerate it:

| Setting | Value | Where |
| --- | --- | --- |
| Application ID | `com.mohammadmansy.stack` | `capacitor.config.json`, `app/build.gradle` |
| Target / compile SDK | **36** (Android 16) | `android/variables.gradle` |
| Min SDK | 23 (Android 6.0) | `android/variables.gradle` |
| Orientation | portrait, locked | `AndroidManifest.xml` |
| AGP / Gradle | 8.11.0 / 8.13 | `build.gradle`, `gradle-wrapper.properties` |
| Permissions | `INTERNET` only | `AndroidManifest.xml` |
| Release signing | keystore outside the repo | `android/key.properties` (git-ignored) |

The target SDK matters: since **31 August 2026 Google Play rejects new apps
below API 36**. Capacitor generates 34, which is why this was raised.

### 1.2 Build the upload file

```bash
npm install
npm run build:android          # web bundle + cap sync into android/
cd android
gradlew.bat bundleRelease      # gradlew on macOS/Linux
```

Output → `app/build/outputs/bundle/release/app-release.aab`

A copy is placed in `release/Stack-1.0-aab.aab`. **That AAB is the file you
upload to Play Console.**

### 1.3 Test it on your phone first

Play review rejects apps that crash, so install it locally before uploading:

```bash
gradlew.bat assembleRelease
adb install -r app\build\outputs\apk\release\app-release.apk
```

No `adb`? Copy `release/Stack-1.0.apk` to the phone and open it (allow
"install from unknown apps" for your file manager).

Check: game starts, blocks drop on tap, sound plays, score persists after
force-close, and rotating the phone does nothing (portrait is locked).

### 1.4 Prerequisites on a fresh machine

- **JDK 17+** and the **Android SDK** with `platforms;android-36`,
  `build-tools;36.0.0` and `platform-tools`.
- Set `JAVA_HOME`, `ANDROID_HOME` (and `ANDROID_SDK_ROOT`) — Gradle reads them.

Android Studio gives you all of this in one install. The setup used to produce
the committed build was a portable, no-admin install:

```
C:\Users\Mohamed\AppData\Local\Android\jdk17     ← Temurin JDK 17
C:\Users\Mohamed\AppData\Local\Android\Sdk       ← cmdline-tools + platforms 36
```

`android/local.properties` points Gradle at the SDK and is git-ignored.

### 1.5 Release signing — read this

The keystore is **outside the repository**, at:

```
C:\Users\Mohamed\keystores\stack-release.keystore
C:\Users\Mohamed\keystores\stack-release-passwords.txt
```

**Back both up now**, in a password manager and a second drive. They are what
let you ship updates to an existing Play listing — losing them means you cannot
update the app, ever. `android/key.properties` holds the same password and is
git-ignored.

Play will offer **Play App Signing** on first upload — accept it. Google then
holds the key, so a lost local keystore stops being fatal (though you still
need it to sign the bundle you upload).

To rotate to your own keystore later:

```bash
keytool -genkeypair -v -keystore stack-release.keystore -alias stack \
  -keyalg RSA -keysize 2048 -validity 10000
```

then point `android/key.properties` at it.

### 1.6 Play Console listing

Everything below is generated and ready to drop in:

| Asset | File | Required size |
| --- | --- | --- |
| App icon | `store/store-icon-512.png` | 512 × 512 PNG, opaque |
| Feature graphic | `store/feature-graphic-1024x500.png` | 1024 × 500 |
| Screenshots | capture on the phone | min 2, portrait |

Steps:

1. Play Console → **All apps → Create app** → name `Stack`, language, free,
   type **Game**.
2. **Testing → Internal testing** → create a release → upload the AAB. Fix
   anything it flags before going further.
3. **Main store listing**: title ≤ 30 chars, short description ≤ 80, full
   description ≤ 4000, the two graphics above, 2–4 portrait screenshots.
4. **App content → Content rating**: complete the IARC questionnaire. No
   violence, no chat, no purchases → expect Everyone / PEGI 3.
5. **App content → Data safety**: *no data collected, no data shared*. The game
   stores one local value (`stack-game-v1`) in `localStorage` — device-local,
   not collected, gone on uninstall.
6. **App content → Privacy policy**: **required**. Host a short page anywhere
   public and paste the URL. Say plainly: no accounts, no network calls, no
   analytics, no ads, one local high score kept on the device.
7. **Ads**: none — declare it.
8. **Release → Production**, preferably a staged rollout (10% → 50% → 100%).

### 1.7 Screenshots that pass

Capture on a real phone, portrait, full-screen, no device chrome and no other
apps in frame. Show: the menu, mid-run tower, a Level-Up tier moment, and game
over with the score.

---

## 2. Web / PWA / WebGL

`www/` is a plain static bundle — no server-side anything.

```bash
npm run build
```

Upload `www/` to GitHub Pages, Netlify, itch.io, or any static host. HTTPS is
required for the service worker and for `Add to Home Screen`; the bundle then
works fully offline after the first load. All URLs are relative, so a sub-path
host needs no edits.

---

## 3. Desktop

```bash
npm run desktop:dev      # run un-packaged
npm run desktop:win      # NSIS installer → dist/
npm run desktop:mac      # dmg + zip   (run on macOS)
npm run desktop:linux    # AppImage + deb
```

The Electron shell serves `www/` over a privileged `app://` scheme — `file://`
is avoided on purpose because Chromium blocks ES module imports there, which is
exactly how the game is written. F11 toggles fullscreen.

> Electron's binary download is skipped by npm's script allow-list on first
> install. Run `npm approve-scripts electron` before `desktop:*`.

Icons resolve automatically: `icons/icon.ico` for Windows, `icons/icon-512.png`
for macOS and Linux.

---

## Release checklist

Before any upload:

- [ ] `npm run verify` passes
- [ ] `versionCode` **incremented** in `android/app/build.gradle` (Play rejects
      an upload that reuses a version code you already shipped)
- [ ] `versionName` updated to match
- [ ] `CACHE` bumped in `sw.js` (`'stack-v1'` → `'stack-v2'`) so returning web
      players stop getting the old bundle
- [ ] rebuilt: `npm run build:android` then `gradlew.bat bundleRelease`
- [ ] installed on a real device and played a full run

---

## Licence

MIT. Do what you like, keep the notice.
