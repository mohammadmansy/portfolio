# Stack — 3D Tower Builder

A one-tap 3D tower builder. Each block sweeps in on an axis, you tap to drop it,
and whatever overhangs the block below gets sliced off — so the tower drifts,
narrows, and eventually kills you. Pure canvas, zero dependencies, ~90 KB.

Same game, four ways to ship:

| Target | Artefact |
| --- | --- |
| Web / PWA (installable, offline) | `www/` on any static host |
| Android → **Google Play** | `app-release.aab` |
| iOS → **App Store** | `.app` via Xcode |
| Windows / macOS / Linux | NSIS installer, DMG, AppImage, deb |

---

## Run it

```bash
npm install
npm run build        # validates sources + writes www/
npm start            # http://localhost:4173
```

`npm run build` refuses to produce a bundle that references a missing file, has a
broken import, or ships an empty asset. `npm run verify` runs the same gate plus
a staleness check — run it before every store upload.

```bash
npm run verify       # static gate, no browser needed
npm run desktop:dev  # run the desktop shell
```

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
electron/             desktop shell (app:// protocol)
icons/                PWA + favicon assets
store/                Google Play listing assets
assets/               source art for native icons (@capacitor/assets)
www/                  ← build output, consumed by every target
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
export function moveSpeedForLevel(level) {
  return DIFFICULTY.base + Math.min(DIFFICULTY.cap, level * DIFFICULTY.perLevel);
}
```

`BLOCK.RANGE` is the sweep half-width (how far the block travels) and
`BLOCK.PERFECT` is the snap tolerance in world units — widen it to be kinder,
narrow it to be meaner.

Level design rules the game follows, worth keeping if you extend it:

- **Physics runs on a fixed 120 Hz timestep** (`main.js`), so a 60 Hz phone and
  a 144 Hz monitor play identically.
- **The sweep is relative to the block below**, not to world origin, so a
  drifted tower still stacks correctly. Changing this breaks the game.
- **Axis alternates every level** (`x`, `z`, `x`…) which is what makes the
  tower spiral instead of leaning one way.
- **Slicing is axis-naive** (`min`/`max` of the two spans) — the overhang falls
  off on the axis you were sweeping, which reads correctly in isometric view.
- **Dropping never leaves the run** if the moving block still overlaps the block
  below; zero overlap = crash. No random deaths.

---

## 1. Web / PWA / WebGL

`www/` is a plain static bundle — no server-side anything.

```bash
npm run build
```

Upload `www/` to GitHub Pages, Netlify, itch.io, or any static host. HTTPS is
required for the service worker and for `Add to Home Screen`; the bundle then
works fully offline after the first load.

For a sub-path host (e.g. `user.github.io/stack/`), all URLs are already
relative, so nothing needs editing.

---

## 2. Android → Google Play

### 2.1 Create the native project (once)

```bash
npm install
npm run build
npx cap add android
```

This generates `android/`. Commit it — it holds your permissions, icons and
version code and is source, not build output.

### 2.2 Meet the Play target API requirement

As of **31 August 2026, new apps must target Android 16 (API 36)**. Capacitor 6
generates `targetSdkVersion = 34`, which Play will reject. Fix it once:

1. Install SDK Platform 36 in Android Studio → SDK Manager.
2. Edit `android/variables.gradle`:

```gradle
ext {
    minSdkVersion = 23
    compileSdkVersion = 36
    targetSdkVersion = 36
    // ...
}
```

3. If Gradle refuses to resolve 36, bump the Android Gradle Plugin to the
   version your Android Studio ships with, in `android/build.gradle`.

> Check the live requirement before every release:
> <https://developer.android.com/google/play/requirements/target-sdk>

### 2.3 Keep it portrait

Play accepts either orientation, but the game is designed portrait-locked.
In `android/app/src/main/AndroidManifest.xml`, on the `<activity>`:

```xml
android:screenOrientation="portrait"
```

### 2.4 Sync and build a bundle

```bash
npm run build:android      # build + cap sync android
cd android
./gradlew.bat bundleRelease    # Windows (gradlew on macOS/Linux)
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

To sanity-check on a device first, use `./gradlew installRelease` or run the
debug build from Android Studio.

### 2.5 Sign it properly

Never ship the debug keystore. Generate a release one (keep it and its
passwords safe — you cannot update the app without them):

```bash
keytool -genkey -v -keystore stack-release.keystore -alias stack \
  -keyalg RSA -keysize 2048 -validity 10000
```

Create `android/key.properties` (git-ignored by Capacitor's template):

```properties
storeFile=C:/path/to/stack-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=stack
keyPassword=YOUR_KEY_PASSWORD
```

Then wire it into `android/app/build.gradle`:

```gradle
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties["storeFile"])
                storePassword keystoreProperties["storePassword"]
                keyAlias keystoreProperties["keyAlias"]
                keyPassword keystoreProperties["keyPassword"]
            }
        }
    }
    buildTypes {
        release {
            signingConfig keystorePropertiesFile.exists()
                ? signingConfigs.release
                : signingConfigs.debug
        }
    }
}
```

Play App Signing: when you first upload, Play will ask you to enrol. Let it —
Google holds the key and re-signs for you, so a lost keystore is no longer fatal.

### 2.6 Play Console listing

Everything below is generated or ready to drop in:

| Asset | File |
| --- | --- |
| App icon, 512×512 PNG, opaque | `store/store-icon-512.png` |
| Feature graphic, 1024×500 | `store/feature-graphic-1024x500.png` |
| Screenshots (min 2, phone) | capture from a real device |

Steps:

1. Pay the one-time $25 developer fee.
2. **All apps → Create app** → name `Stack`, language, free, app (not game is
   wrong — pick *Game*).
3. **Testing → Internal testing** → upload the AAB. Fix anything it flags.
4. **Main store listing**: title (≤30 chars), short description (≤80), full
   description (≤4000), the two graphics above, 2–4 phone screenshots.
5. **App content → Content rating**: complete the IARC questionnaire. This game
   has no violence, no chat, no purchases → expect Everyone / PEGI 3.
6. **App content → Data safety**: *no data collected, no data shared*. The game
   stores only a local high score in `localStorage` — that is device-local and
   not collected.
7. **App content → Privacy policy**: **required**. Host a short page anywhere
   public and paste the URL. Say plainly: no accounts, no network calls, no
   analytics, one local value (`stack-game-v1`) kept on the device, cleared by
   uninstalling.
8. **Ads**: none. Declare it.
9. **Release → Production**, ideally a staged rollout (10% → 50% → 100%) so a
   bad build only reaches part of your audience.

Review typically takes hours to a few days for a first submission.

### 2.7 Screenshots that pass

Capture on a real phone or emulator at 1080×1920 or taller, portrait. Show:
menu screen, mid-run tower, a Level-Up tier moment, game over with the score.
No device chrome, no letterboxing, no other apps in frame.

---

## 3. iOS → App Store

Requires macOS with a current Xcode.

```bash
npm install
npm run build
npx cap add ios
npm run build:ios
npm run open:ios
```

### Native app icons

Apple requires a 1024×1024 PNG with **no transparency**. It is already in the
repo, and `@capacitor/assets` expands it into every iOS/Android size:

```bash
npm install -D @capacitor/assets
npx @capacitor/assets generate --ios --android
```

### Orientation and safe area

In Xcode, target → *General* → *Supported orientations*: **Portrait only**.
The game already respects `viewport-fit=cover` and the safe-area insets, so it
sits correctly under the Dynamic Island.

### Signing and upload

1. Apple Developer account ($99/year) → create an App ID `com.mohammadmansy.stack`
   (matches `capacitor.config.json`).
2. In Xcode, set your Team under *Signing & Capabilities*. Automatic signing
   handles the rest.
3. *Product → Archive* → *Distribute App* → App Store Connect.
4. In App Store Connect: app name, subtitle, screenshots (6.7" display
   recommended), description, keywords, privacy policy URL, age rating
   questionnaire, and the App Privacy report (*no data collected*).
5. Submit for review.

If you do not own a Mac, rent one (MacinCloud, GitHub-hosted macOS runner, or
CircleCI macOS) just for the Archive step.

---

## 4. Desktop

```bash
npm run desktop:dev      # run un-packaged
npm run desktop:win      # NSIS installer → dist/
npm run desktop:mac      # dmg + zip   (run on macOS)
npm run desktop:linux    # AppImage + deb
```

The Electron shell serves `www/` over a privileged `app://` scheme — `file://`
is avoided on purpose because Chromium blocks ES module imports there, which is
exactly how the game is written. F11 toggles fullscreen.

Icons resolve automatically: `icons/icon.ico` for Windows, `icons/icon-512.png`
for macOS and Linux.

---

## Release checklist

Before any upload:

- [ ] `npm run verify` passes
- [ ] version bumped in `package.json`
- [ ] `versionCode` / `versionName` bumped in `android/app/build.gradle`
- [ ] `CACHE` bumped in `sw.js` (`'stack-v1'` → `'stack-v2'`) — otherwise
      returning web players keep the old bundle
- [ ] target API level still meets the current Play minimum
- [ ] store graphics refreshed if the visuals changed

---

## Licence

MIT. Do what you like, keep the notice.
