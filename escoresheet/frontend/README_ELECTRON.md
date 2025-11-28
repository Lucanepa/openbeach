# Building Desktop Executable

This PWA can be packaged as a desktop application using Electron.

## Setup

1. Install dependencies:
```bash
npm install
```

## Development

Run the app in Electron during development:
```bash
npm run electron:dev
```

This will:
- Start the Vite dev server
- Launch Electron when the server is ready
- Open DevTools automatically

## Building Executables

### Build for Current Platform
```bash
npm run electron:build
```

### Build for Specific Platforms

**Windows:**
```bash
npm run electron:build:win
```
Creates:
- `dist-electron/OpenBeach eScoresheet Setup X.X.X.exe` (Installer)
- `dist-electron/OpenBeach eScoresheet X.X.X.exe` (Portable)

**macOS:**
```bash
npm run electron:build:mac
```
Creates:
- `dist-electron/OpenBeach eScoresheet-X.X.X.dmg` (Disk image)
- `dist-electron/OpenBeach eScoresheet-X.X.X-mac.zip` (ZIP archive)

**Linux:**
```bash
npm run electron:build:linux
```
Creates:
- `dist-electron/OpenBeach eScoresheet-X.X.X.AppImage` (AppImage)
- `dist-electron/OpenBeach eScoresheet_X.X.X_amd64.deb` (Debian package)

## Icons

To customize app icons, place them in a `build/` directory:
- Windows: `build/icon.ico` (256x256 or larger)
- macOS: `build/icon.icns` (512x512 or larger)
- Linux: `build/icon.png` (512x512 or larger)

If icons are not provided, Electron Builder will use default icons.

## Notes

- The app runs fully offline using IndexedDB
- All PWA features work in the desktop version
- The executable includes the entire built application
- File size: ~100-150 MB (includes Chromium)

## Troubleshooting

If you get errors about missing dependencies:
```bash
npm install --save-dev electron electron-builder concurrently wait-on
```

For Windows code signing (optional):
- Set `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables
- Or configure in `package.json` under `build.win.certificateFile`

