# Building and Releasing Desktop Apps

This guide explains how to build the desktop executables and make them available for download on your website.

## Step 1: Build the Executables

### For Windows:
```bash
npm run electron:build:win
```

This creates:
- `dist-electron/OpenBeach eScoresheet Setup X.X.X.exe` (Installer)
- `dist-electron/OpenBeach eScoresheet X.X.X.exe` (Portable)

### For macOS:
```bash
npm run electron:build:mac
```

This creates:
- `dist-electron/OpenBeach eScoresheet-X.X.X.dmg` (Disk image)
- `dist-electron/OpenBeach eScoresheet-X.X.X-mac.zip` (ZIP archive)

### For Linux:
```bash
npm run electron:build:linux
```

This creates:
- `dist-electron/OpenBeach eScoresheet-X.X.X.AppImage` (AppImage)
- `dist-electron/OpenBeach eScoresheet_X.X.X_amd64.deb` (Debian package)

## Step 2: Host the Files

### Option A: GitHub Releases (Recommended)

1. **Create a new release on GitHub:**
   - Go to your repository: `https://github.com/Lucanepa/openbeach`
   - Click "Releases" → "Create a new release"
   - Tag version: `v0.1.0` (or your version)
   - Release title: `v0.1.0` or `Release 0.1.0`

2. **Upload the built files:**
   - Drag and drop the following files:
     - `OpenBeach eScoresheet Setup X.X.X.exe` → Rename to: `OpenBeach-eScoresheet-Setup.exe`
     - `OpenBeach eScoresheet-X.X.X.dmg` → Rename to: `OpenBeach-eScoresheet.dmg`
   - Or use the exact filenames that match your download links

3. **Publish the release**

4. **The download links will automatically work:**
   - Windows: `https://github.com/Lucanepa/openbeach/releases/latest/download/OpenBeach-eScoresheet-Setup.exe`
   - macOS: `https://github.com/Lucanepa/openbeach/releases/latest/download/OpenBeach-eScoresheet.dmg`

### Option B: Custom Hosting

If you want to host files elsewhere (AWS S3, your own server, etc.):

1. Upload the built files to your hosting
2. Update the download links in `src_beach/App_beach.jsx`:
   ```jsx
   href="https://your-domain.com/downloads/OpenBeach-eScoresheet-Setup.exe"
   ```

## Step 3: Update Version Numbers

When releasing a new version:

1. Update `package.json` version:
   ```json
   "version": "0.1.1"
   ```

2. Rebuild:
   ```bash
   npm run electron:build:win
   npm run electron:build:mac
   ```

3. Create a new GitHub release with the new version

## Automated Release (Optional)

You can create a GitHub Actions workflow to automatically build and release:

1. Create `.github/workflows/release.yml`
2. Trigger on tag push
3. Build for all platforms
4. Create GitHub release with artifacts

## File Naming Convention

The download links expect these exact filenames:
- Windows: `OpenBeach-eScoresheet-Setup.exe`
- macOS: `OpenBeach-eScoresheet.dmg`

If your build creates different filenames, either:
1. Rename the files before uploading to GitHub Releases
2. Update the download links in `App_beach.jsx` to match your actual filenames

## Testing Downloads

1. Build the executables locally
2. Test that they work on your system
3. Upload to GitHub Releases (or your hosting)
4. Test the download links on your website
5. Verify the files download and install correctly

## Notes

- **File Size:** Each executable is ~100-150 MB (includes Chromium)
- **Code Signing:** For production, consider code signing (Windows: Authenticode, macOS: Apple Developer)
- **Auto-updates:** Can be configured using `electron-updater` for automatic updates
- **Icons:** Add custom icons in `build/` directory (icon.ico, icon.icns, icon.png)

