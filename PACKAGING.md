# Building SB Crypto Signals: Android APK and Windows EXE

The app is a Vite + React + TypeScript web application. It is packaged — not rewritten — for both targets:

- **Android:** Capacitor wraps the built web app in a native Android shell.
- **Windows:** Electron loads the same built web app; electron-builder produces the installer.

Both share the same Supabase auth, Binance market data, and all features.

---

## Android APK

### Requirements
- Java JDK 17+ and Android Studio (or at minimum the Android SDK + Gradle). Install from https://developer.android.com/studio.

### One-time setup
```bash
npm install
npx cap add android        # already done — skip if android/ exists
npx cap sync android       # copies dist/ into the native project
```

### Build a debug APK (installs on any phone, "unknown sources" enabled)
```bash
cd android
./gradlew assembleDebug
# output: android/app/build/outputs/apk/debug/app-debug.apk
```

### Build a release APK (signed, shareable)
1. Generate a signing key (once):
   ```bash
   keytool -genkey -v -keystore sb-release.keystore -alias sbcrypto \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Create `android/keystore.properties`:
   ```properties
   storeFile=../../sb-release.keystore
   storePassword=YOUR_PASSWORD
   keyAlias=sbcrypto
   keyPassword=YOUR_PASSWORD
   ```
   And add to `android/app/build.gradle` (before the `android {}` block):
   ```gradle
   def keystoreProperties = new Properties()
   keystoreProperties.load(new FileInputStream(rootProject.file("keystore.properties")))
   ```
   Inside `android {}`:
   ```gradle
   signingConfigs {
       release {
           storeFile file(keystoreProperties['storeFile'])
           storePassword keystoreProperties['storePassword']
           keyAlias keystoreProperties['keyAlias']
           keyPassword keystoreProperties['keyPassword']
       }
   }
   buildTypes {
       release {
           signingConfig signingConfigs.release
       }
   }
   ```
3. Build:
   ```bash
   cd android
   ./gradlew assembleRelease
   # output: android/app/build/outputs/apk/release/app-release.apk
   ```

Install by copying the APK to the phone and opening it (allow "install unknown apps" when prompted).

### After any code change
```bash
npm run build && npx cap sync android
```
then rebuild the APK.

---

## Windows EXE installer

### Requirements
- Node.js (already needed for the project) and Windows. The NSIS installer can only be produced on Windows (or via CI, see below).

### Build
```bash
npm install
npm run electron:build
# output: release/SB Crypto Signals Setup 1.0.0.exe
```

### Run without installing (quick test)
```bash
npm run build
npm run electron:dev
```

### Building on non-Windows machines
electron-builder can build the Windows target on Linux/macOS for NSIS, but code signing and some NSIS steps are more reliable on real Windows or CI (e.g. GitHub Actions `windows-latest` runner).

---

## Notes
- `vite.config.ts` uses `base: './'` so the built app works from `file://` (Electron) and Capacitor's local server.
- Electron main process: `electron/main.js` — sandboxed, no Node access in the renderer; external links open in the system browser.
- App identity: `com.sbcryptosignals.app`, name "SB Crypto Signals" in both packages.
- Icons: `build/icon.png` is currently a placeholder — replace it with a real 512×512 PNG of the SB logo for a polished installer/shortcut icon (the Android launcher icon lives in `android/app/src/main/res/mipmap-*`).
