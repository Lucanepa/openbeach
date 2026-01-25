---
description: 
alwaysApply: true
---

# OpenBeach - Beach Volleyball eScoresheet

Offline-first beach volleyball scoring application with multi-platform support (Web PWA, Windows, macOS, Linux).

## Tech Stack

- **Frontend**: React 18 + Vite
- **Database**: Dexie (IndexedDB wrapper) for offline-first local storage
- **Cloud Sync**: Supabase (auth, realtime, storage)
- **Desktop**: Electron
- **PDF**: jsPDF, pdf-lib, pdfjs-dist
- **i18n**: i18next (en, fr, it, de, de-CH)
- **Styling**: Single CSS file with CSS variables (dark theme)

## Project Structure

```
escoresheet/frontend/
├── src_beach/           # Beach volleyball source code
│   ├── components_beach/    # React components
│   ├── hooks_beach/         # Custom hooks
│   ├── utils_beach/         # Utilities
│   ├── i18n_beach/          # Translations
│   └── *App_beach.jsx       # Entry points
├── scoresheet_pdf_beach/    # PDF generation
├── public_beach/            # Static assets
└── electron/                # Desktop app
```

## Commands

Run from `escoresheet/frontend/`:

```bash
npm run dev              # Dev server (port 6173)
npm run build            # Production build
npm run electron:dev     # Dev with Electron
npm run electron:build:win   # Build Windows installer
npm run electron:build:mac   # Build macOS DMG
npm run electron:build:linux # Build Linux packages
```

## Key Entry Points

- **App_beach.jsx** - Main scoresheet management
- **RefereeApp_beach.jsx** - Referee interface
- **LivescoreApp_beach.jsx** - Spectator display
- **ScoresheetApp_beach.jsx** - Scoring interface

## Architecture Patterns

### Offline-First Sync
- All data written to IndexedDB first
- Sync queue processes changes to Supabase when online
- External IDs enable idempotent retries

### Two-Path Sync
1. **Queued**: Events, sets, match data → reliable but slower
2. **Direct**: match_live_state → sub-second for spectators

### State Management
- React hooks + Context API (AuthContext, AlertContext)
- Dexie `useLiveQuery` for reactive database reads
- Refs for performance-critical non-reactive state

## Naming Conventions

- `*_beach.jsx/js` - Beach volleyball specific files
- `*_old.jsx/js` - Legacy code kept for reference
- `*-main_beach.jsx` - Entry point files
- team1 and team2 instead of home and away, forever, for the teams




## Guidelines

DELETE LIBERO, SUBSTITUTION, COACH, EXCEPTIONAL SUBSTITUTION, BENCH OFFICIAL, BENCH PLAYERS mentions and code

### Do
- Use functional components with hooks
- Use existing patterns (Modal, useLiveQuery, context providers)
- Keep offline-first in mind - write to IndexedDB, sync later
- Use the existing CSS variables for styling
- Test offline scenarios

### Don't
- Add new npm dependencies without good reason
- Create new CSS files (use styles_beach.css)
- Break offline functionality
- Add inline styles (use CSS classes)
- Forget to handle loading/error states for async operations
- keep libero, substitutions, coach, bench players and officials, drag etc function

## Environment Variables

Required in `.env`:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_BACKEND_URL=
```

## Database Schema (Dexie)

Key tables: `teams`, `players`, `matches`, `sets`, `events`, `sync_queue`, `match_setup`, `referees`, `scorers`

## CSS Theme Variables

```css
--bg: #0b1220;      /* Background */
--panel: #111827;   /* Panel background */
--text: #e5e7eb;    /* Primary text */
--muted: #9ca3af;   /* Muted text */
--accent: #22c55e;  /* Green accent */
--danger: #ef4444;  /* Red/danger */
```
