# Backend Proxy Migration — Changeset from openvolley

This document describes all changes needed to migrate openbeach from direct Supabase frontend calls to a backend proxy architecture, matching what was done in openvolley.

## Why

All `VITE_*` env vars (including `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`) are embedded in the built JS bundle by Vite. Since there's no RLS blocking direct access, anyone who inspects the bundle can read/write/delete data. The fix: route all DB/storage/auth operations through the backend using a `service_role` key that stays server-side.

## Architecture

```
BEFORE: Frontend → Supabase (anon key in bundle)
AFTER:  Frontend → Backend API → Supabase (service_role key, server-side only)
```

Exception: Supabase Realtime (WebSocket subscriptions) can't be proxied. The anon key stays in the bundle for Realtime only, but RLS denies all REST API access for that key.

---

## Changes to Apply

### 1. Backend: Create `escoresheet/backend/` directory

Copy the entire `escoresheet/backend/` directory from openvolley. Key files:

- `server.js` — Contains all proxy endpoints (`/api/db`, `/api/storage/*`, `/api/auth/*`)
- `package.json` — Dependencies including `@supabase/supabase-js`

**Important**: Update the `ALLOWED_TABLES` whitelist in `server.js` to match openbeach's tables:
```js
const ALLOWED_TABLES = ['matches', 'sets', 'events', 'match_live_state', 'profiles', 'user_matches', 'beach_competition_matches']
```
(Remove `referee_database`, `svrz_games` if not used in openbeach. Add any beach-specific tables.)

### 2. Frontend: Create `src_beach/lib_beach/apiClient_beach.js`

Copy `apiClient.js` from openvolley's `src/lib/apiClient.js`. This provides:

- `apiFrom(table)` — drop-in replacement for `supabase.from(table)`
- `apiStorage.from(bucket)` — drop-in for storage operations
- `apiAuth` — drop-in for auth operations
- `apiRpc(fn, params)` — drop-in for RPC calls

The file uses `getApiUrl()` from `backendConfig_beach.js` which already exists.

### 3. Frontend: Update `backendConfig_beach.js`

Change the `CLOUD_RELAY_URL`:
```js
// BEFORE:
const CLOUD_RELAY_URL = 'https://escoresheet-backend-production.up.railway.app'

// AFTER:
const CLOUD_RELAY_URL = 'https://backend-beach.openvolley.app'  // or whatever your Infomaniak URL is
```

### 4. Frontend: Update `supabaseClient_beach.js`

Keep it for Realtime only:
```js
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = (url && key) ? createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { params: { eventsPerSecond: 10 } }
}) : null
```

### 5. Frontend: Migrate all `supabase.from()` calls

Pattern for every file:

```js
// BEFORE:
import { supabase } from '../lib_beach/supabaseClient_beach'
const { data, error } = await supabase.from('matches').select('*').eq('id', id).single()

// AFTER:
import { apiFrom } from '../lib_beach/apiClient_beach'
const { data, error } = await apiFrom('matches').select('*').eq('id', id).single()
```

Files that need migration (based on grep results):

| File | What to change |
|------|---------------|
| `hooks_beach/useSyncQueue_beach.js` | `supabase.from('matches')` → `apiFrom('matches')`, remove `if (!supabase)` guards, use `hasBackend()` |
| `components_beach/Scoreboard_beach.jsx` | ~7 `supabase.from()` calls for `match_live_state`, `matches`, `sets` |
| `components_beach/MatchSetup_beach.jsx` | `supabase.from('matches')` connection check + `user_matches` upsert |
| `utils_beach/backupManager_beach.js` | `supabase.from()` for sets, events, match_live_state |
| `App_beach.jsx` | `supabase.from('teams')` for test match loading |

For files that also use `supabase.channel()` (Realtime), keep the supabase import alongside apiFrom:
```js
import { supabase } from '../lib_beach/supabaseClient_beach'  // Realtime only
import { apiFrom } from '../lib_beach/apiClient_beach'         // DB operations
```

### 6. Frontend: Migrate auth calls (if applicable)

If openbeach has an AuthContext similar to openvolley:
```js
// BEFORE:
supabase.auth.signInWithPassword(...)
supabase.from('profiles').select(...)

// AFTER:
apiAuth.signInWithPassword(...)
apiFrom('profiles').select(...)
```

### 7. Frontend: Migrate storage calls (if applicable)

```js
// BEFORE:
supabase.storage.from('scoresheets').upload(path, file)

// AFTER:
apiStorage.from('scoresheets').upload(path, file)
```

### 8. Supabase: Run RLS migration

Run in Supabase SQL Editor to deny anon key REST access.
Adapt the policy names to match what exists in openbeach's Supabase project:

```sql
-- Query existing policies first:
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';

-- Then DROP each one and ensure RLS is enabled on all tables.
-- With RLS enabled + no policies = deny all for anon.
-- service_role bypasses RLS.
```

Copy and adapt `003_rls_deny_anon.sql` from openvolley.

### 9. Environment Variables

**Backend (Infomaniak):**
| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | Your beach Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase → Settings → API |
| `RESEND_API_KEY` | From resend.com (or use SMTP vars instead) |

**Frontend (keep existing):**
| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | Keep — needed for Realtime only |
| `VITE_SUPABASE_ANON_KEY` | Keep — needed for Realtime only |
| `VITE_BACKEND_URL` | Your Infomaniak backend URL |

---

## Key Files to Copy from openvolley

1. `escoresheet/backend/` — entire directory (server.js, package.json)
2. `escoresheet/frontend/src/lib/apiClient.js` → rename to `apiClient_beach.js`
3. `escoresheet/frontend/src/db/migrations/003_rls_deny_anon.sql` — adapt for beach tables

## Migration Pattern Summary

The migration is mechanical — it's the same pattern for every file:
1. Replace `import { supabase }` with `import { apiFrom }` (and/or `apiStorage`, `apiAuth`)
2. Replace `supabase.from('table')` with `apiFrom('table')`
3. Replace `if (!supabase)` guards with `if (!getApiUrl('/api/db'))` or remove them
4. Keep `supabase` import only in files that use `.channel()` for Realtime
