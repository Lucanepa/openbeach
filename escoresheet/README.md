# Open eScoresheet (PWA)

An offline-first, installable volleyball e-scoresheet. Works fully offline (IndexedDB). Licensed GPL-3.0.

## Quick start

```bash
# 1) Clone
git clone https://github.com/<you>/escoresheet.git
cd escoresheet/frontend

# 2) Configure
cp .env.example .env

# 3) Run locally
npm i
npm run dev

# 4) Build
npm run build
```

Open [http://localhost:5173](http://localhost:5173) during dev. The app is a PWA; you can "Install" it from your browser.

## Deploy (GitHub Pages)

1. Push this repo to GitHub.
2. Ensure `.github/workflows/deploy.yml` is committed.
3. Add a `CNAME` file to `frontend/dist` during deployment containing your subdomain (e.g. `app.yourdomain.org`). The provided workflow handles this if you set `PAGES_CNAME`.
4. In GitHub → Settings → Pages → Source: "GitHub Actions".

### Custom domain via Squarespace

Add DNS records in Squarespace:

* **CNAME**: `app` → `<your-username>.github.io`

## Tech

* React + Vite + PWA
* IndexedDB (Dexie)
* jsPDF (export)

## License

GPL-3.0 — free forever; derivatives must remain open.


