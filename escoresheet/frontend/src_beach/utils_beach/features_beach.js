/**
 * Features that are built but switched off.
 *
 * COMPETITIONS_ENABLED: the competition admin (admin_beach.html), the
 * "load competition match" picker in match setup and the claim / link of a
 * competition match template. They read and write the
 * beach_competition_matches table, which backend.openvolley.app does not
 * serve yet (not in its ALLOWED_TABLES: every call answers 400). Off until
 * the backend has endpoints for it (OpenBeach plan, B3).
 */
export const COMPETITIONS_ENABLED = false
