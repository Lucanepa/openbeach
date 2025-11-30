# Quick Release Instructions

## To Fix the 404 Error for Windows Installer

The download link expects: `OpenBeach-eScoresheet-Setup.exe`

### Step 1: Build the Windows Installer

```bash
cd escoresheet/frontend
npm run electron:build:win
```

This will create the installer in `dist-electron/` folder.

### Step 2: Check the Generated Filename

After building, check what file was created:
- Look in `dist-electron/` folder
- The file might be named: `OpenBeach-eScoresheet-Setup.exe` (correct) 
- OR: `OpenBeach eScoresheet Setup 0.1.0.exe` (needs renaming)

### Step 3: Create GitHub Release

1. Go to: https://github.com/Lucanepa/openbeach/releases
2. Click "Create a new release" or "Draft a new release"
3. **Tag version**: `v0.1.0` (must start with `v`)
4. **Release title**: `v0.1.0` or `Release 0.1.0`
5. **Description**: Add release notes (optional)

### Step 4: Upload the File

1. In the "Attach binaries" section, click "Choose your files" or drag & drop
2. Upload the file from `dist-electron/`
3. **IMPORTANT**: If the file has a different name (with version number), rename it to exactly: `OpenBeach-eScoresheet-Setup.exe`
4. Click "Publish release"

### Step 5: Verify

After publishing, test the download link:
- https://github.com/Lucanepa/openbeach/releases/latest/download/OpenBeach-eScoresheet-Setup.exe

This should now work!

## Troubleshooting

### If the build creates a file with version number:

The `artifactName` in `package.json` should prevent this, but if electron-builder still adds version numbers:

1. Build the installer
2. Rename the file manually to `OpenBeach-eScoresheet-Setup.exe` before uploading
3. Upload the renamed file to GitHub Releases

### If "latest" doesn't work:

The `/latest/download/` URL only works if:
- You have at least one published release
- The release is marked as "Latest release" (usually the most recent)

You can also use a specific version:
- `https://github.com/Lucanepa/openbeach/releases/download/v0.1.0/OpenBeach-eScoresheet-Setup.exe`

### Alternative: Use Specific Version Tag

If `/latest/` doesn't work, update the download link in `App_beach.jsx` to use a specific version:
```jsx
href="https://github.com/Lucanepa/openbeach/releases/download/v0.1.0/OpenBeach-eScoresheet-Setup.exe"
```

