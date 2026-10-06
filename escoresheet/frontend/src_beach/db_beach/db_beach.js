import Dexie from 'dexie'
import { rewriteQueuedSyncJobs } from '../utils_beach/syncIds_beach'

/**
 * ============================================================================
 * LOCAL DATABASE SCHEMA (Dexie/IndexedDB)
 * ============================================================================
 *
 * This is the offline-first local database. All data is written here first,
 * then synced to the OpenVolley backend (backend.openvolley.app) via the
 * sync_queue mechanism.
 *
 * KEY TABLES:
 * - matches: Local match data (synced to Supabase 'matches' table)
 * - sets: Set scores and timing (synced to Supabase 'sets' table)
 * - events: All match events with state snapshots (synced to Supabase 'events' table)
 * - sync_queue: Pending Supabase writes (processed by useSyncQueue hook)
 *
 * SYNC_QUEUE TABLE:
 * ----------------
 * Schema: ++id, resource, action, payload, ts, status
 *
 * Fields:
 * - resource: 'match' | 'set' | 'event' - determines Supabase table
 * - action: 'insert' | 'update' | 'delete' | 'restore' - determines operation
 * - payload: Data to sync, includes external_id for deduplication
 * - ts: Timestamp when queued (for ordering)
 * - status: 'queued' | 'sending' | 'sent' | 'error' | 'failed' | 'dropped' |
 *   'superseded' - processing state (see useSyncQueue_beach.js)
 *
 * Processing order: match → set → event (respects foreign key dependencies)
 *
 * EXTERNAL_ID PATTERN:
 * -------------------
 * All synced resources use external_id as the stable identifier:
 * - Match: seed_key (format: match_{timestamp}_{random})
 * - Set: `${seed_key}:s:${localSetId}` (utils_beach/syncIds_beach.js)
 * - Event: `${seed_key}:e:${localEventId}` (bare ids collided across devices
 *   and matches; the backend refuses them)
 *
 * Why external_id?
 * - Supabase UUID isn't known until first sync
 * - game_n (game number) is mutable and can be null
 * - external_id is immutable → safe for upsert onConflict
 *
 * See: useSyncQueue.js for sync processing logic
 * ============================================================================
 */

export const db = new Dexie('escoresheet')

db.version(1).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1TeamId,team2TeamId,scheduledAt,status,createdAt',
  sets: '++id,matchId,index,team1Points,team2Points,finished',
  events: '++id,matchId,setIndex,ts,type,payload',
  sync_queue: '++id,resource,action,payload,ts,status' // status: queued|sent|error
})

// Version 2: Add signature fields to matches
db.version(2).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1TeamId,team2TeamId,scheduledAt,status,createdAt',
  sets: '++id,matchId,index,team1Points,team2Points,finished',
  events: '++id,matchId,setIndex,ts,type,payload',
  sync_queue: '++id,resource,action,payload,ts,status'
}).upgrade(tx => {
  // Migration: add signature fields to existing matches
  return tx.table('matches').toCollection().modify(match => {
    if (!match.team1CaptainSignature) match.team1CaptainSignature = null
    if (!match.team2CaptainSignature) match.team2CaptainSignature = null
  })
})

// Version 3: Add match_setup table for storing draft data
db.version(3).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1TeamId,team2TeamId,scheduledAt,status,createdAt',
  sets: '++id,matchId,index,team1Points,team2Points,finished',
  events: '++id,matchId,setIndex,ts,type,payload',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt' // Single record to store current draft
})

// Version 4: Add externalId index to matches
db.version(4).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1TeamId,team2TeamId,scheduledAt,status,createdAt,externalId',
  sets: '++id,matchId,index,team1Points,team2Points,finished',
  events: '++id,matchId,setIndex,ts,type,payload',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt'
})

// Version 5: Add referees and scorers tables
db.version(5).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1TeamId,team2TeamId,scheduledAt,status,createdAt,externalId',
  sets: '++id,matchId,index,team1Points,team2Points,finished',
  events: '++id,matchId,setIndex,ts,type,payload',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
})

// Version 6: Add startTime and endTime to sets
db.version(6).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1TeamId,team2TeamId,scheduledAt,status,createdAt,externalId',
  sets: '++id,matchId,index,team1Points,team2Points,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
})

// Version 7: Add test index to matches
db.version(7).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1TeamId,team2TeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,team1Points,team2Points,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
})

// Version 8: Add seq (sequence) field to events for reliable ordering
db.version(8).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1TeamId,team2TeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,team1Points,team2Points,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
})

// Version 9: Add team1TeamPin and team2TeamPin to matches
db.version(9).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1TeamId,team2TeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,team1Points,team2Points,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
}).upgrade(tx => {
  // Migration: add team PIN fields to existing matches
  return tx.table('matches').toCollection().modify(match => {
    if (!match.team1TeamPin) match.team1TeamPin = null
    if (!match.team2TeamPin) match.team2TeamPin = null
  })
})

// Version 10: Add sessionId and gamePin to matches
db.version(10).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1TeamId,team2TeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,team1Points,team2Points,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
}).upgrade(tx => {
  // Migration: add sessionId and gamePin fields to existing matches
  return tx.table('matches').toCollection().modify(match => {
    if (!match.sessionId) match.sessionId = null
    if (!match.gamePin) match.gamePin = null
  })
})

// Version 11: Add upload pins and pending roster data to matches
db.version(11).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1TeamId,team2TeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,team1Points,team2Points,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
}).upgrade(tx => {
  // Migration: add upload pin and pending roster fields to existing matches
  return tx.table('matches').toCollection().modify(match => {
    if (!match.team1TeamUploadPin) match.team1TeamUploadPin = null
    if (!match.team2TeamUploadPin) match.team2TeamUploadPin = null
    if (!match.pendingteam1Roster) match.pendingteam1Roster = null
    if (!match.pendingteam2Roster) match.pendingteam2Roster = null
  })
})

// Version 12: Add post-game captain signatures (separate from pre-game coin toss signatures)
db.version(12).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1TeamId,team2TeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,team1Points,team2Points,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
}).upgrade(tx => {
  // Migration: add post-game captain signature fields to existing matches
  return tx.table('matches').toCollection().modify(match => {
    if (!match.team1PostGameCaptainSignature) match.team1PostGameCaptainSignature = null
    if (!match.team2PostGameCaptainSignature) match.team2PostGameCaptainSignature = null
  })
})

// Version 13: Add stateSnapshot to events for snapshot-based undo system
// Each event now stores a full state snapshot AFTER the event is applied
// This enables trivial undo (just restore previous snapshot) instead of complex per-event logic
db.version(13).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1TeamId,team2TeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,team1Points,team2Points,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq,stateSnapshot',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
})

// Version 14: Add compound indexes on events for performance optimization
// [matchId+seq] enables fast max seq lookup without full table scan
// [matchId+setIndex] enables fast set-specific event filtering
db.version(14).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1TeamId,team2TeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,team1Points,team2Points,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq,stateSnapshot,[matchId+seq],[matchId+setIndex]',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
})

// Version 15: Add interaction_logs table for comprehensive logging
// Stores all user interactions (clicks, inputs, function calls, etc.)
// Indexed by id (unique log ID), ts (timestamp), and gameNumber for filtering
db.version(15).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1TeamId,team2TeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,team1Points,team2Points,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq,stateSnapshot,[matchId+seq],[matchId+setIndex]',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt',
  interaction_logs: 'id,ts,gameNumber,category,sessionId'
})

// Version 16: Rename home/team2 to team1/team2 throughout
// This is a terminology change - beach volleyball uses Team 1/Team 2 not Home/team2
db.version(16).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1Id,team2Id,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,team1Points,team2Points,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq,stateSnapshot,[matchId+seq],[matchId+setIndex]',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt',
  interaction_logs: 'id,ts,gameNumber,category,sessionId'
}).upgrade(tx => {
  // Migrate matches: team1TeamId → team1Id, team2TeamId → team2Id
  tx.table('matches').toCollection().modify(match => {
    match.team1Id = match.team1TeamId
    match.team2Id = match.team2TeamId
    delete match.team1TeamId
    delete match.team2TeamId
    // Signature fields keep the same name (team1CaptainSignature/team2CaptainSignature)
    // No rename needed - they were already correctly named
    // Rename PIN fields
    match.team1Pin = match.team1TeamPin
    match.team2Pin = match.team2TeamPin
    delete match.team1TeamPin
    delete match.team2TeamPin
    // Rename upload PIN fields
    match.team1UploadPin = match.team1TeamUploadPin
    match.team2UploadPin = match.team2TeamUploadPin
    delete match.team1TeamUploadPin
    delete match.team2TeamUploadPin
    // Pending roster fields keep the same name - no rename needed
    // Post-game signature fields keep the same name - no rename needed
  })
  // Sets: team1Points/team2Points keep the same name - no rename needed
})

// Version 17: Add per-target sync status for dual-target sync (Supabase + Synology)
// Each sync job now tracks status separately for each sync target
// This enables syncing to both Supabase (cloud) and Synology (local NAS) independently
db.version(17).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1Id,team2Id,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,team1Points,team2Points,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq,stateSnapshot,[matchId+seq],[matchId+setIndex]',
  sync_queue: '++id,resource,action,payload,ts,status,supabase_status,synology_status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt',
  interaction_logs: 'id,ts,gameNumber,category,sessionId'
}).upgrade(tx => {
  // Migrate existing sync_queue jobs: add per-target status fields
  return tx.table('sync_queue').toCollection().modify(job => {
    // Copy existing status to supabase_status (existing behavior)
    job.supabase_status = job.status
    // Queue all existing jobs for Synology sync (will be skipped if not configured)
    job.synology_status = 'queued'
  })
})

/**
 * Collapse the per-target statuses of the removed dual sync (Supabase +
 * Synology) into the one `status` the queue reads now:
 * supabase_status 'sent' -> 'sent', 'error' -> 'error'; everything not yet sent
 * to the cloud -> 'queued'. Exported for tests.
 * @param {object} job - sync_queue row (modified in place)
 */
export function collapseTargetStatus(job) {
  const cloud = job.supabase_status
  if (cloud === 'sent' || (cloud === undefined && job.status === 'sent')) {
    job.status = 'sent'
  } else if (cloud === 'error') {
    job.status = 'error'
    job.attempts = job.attempts || 1
  } else if (job.status !== 'dropped') {
    // queued for the cloud, or a direct (set end) send that failed: the queue
    // used to resend those because supabase_status was not 'sent'
    job.status = 'queued'
  }
  delete job.supabase_status
  delete job.synology_status
  delete job.supabase_retry_count
  delete job.synology_retry_count
}

// Version 18: one sync target (the OpenVolley backend), namespaced ids.
// - The Synology/PocketBase target is gone: per-target statuses collapse into
//   `status` (collapseTargetStatus).
// - Set/event external ids become `${seed}:s:${id}` / `${seed}:e:${id}`
//   (utils_beach/syncIds_beach.js): bare Dexie ids ('42') and the coin toss's
//   'coin_toss_<seed>' are refused by the backend (400 OV_UNSCOPED_EXTERNAL_ID)
//   and collided across devices. Waiting jobs are rewritten; parked ones are put
//   back in the queue; jobs that cannot be attributed to a match are 'dropped'.
// The upgrade must never reject: a failed upgrade leaves the database unopenable.
db.version(18).stores({
  sync_queue: '++id,resource,action,payload,ts,status'
}).upgrade(async tx => {
  try {
    await tx.table('sync_queue').toCollection().modify(collapseTargetStatus)
  } catch (e) {
    console.warn('[db] v18 sync status collapse skipped:', e?.message)
  }
  try {
    const { rewritten, dropped, failed } = await rewriteQueuedSyncJobs({
      queue: tx.table('sync_queue'),
      sets: tx.table('sets'),
      matches: tx.table('matches'),
      events: tx.table('events')
    }, { statuses: ['queued', 'error', 'failed'], requeue: true })
    if (rewritten || dropped || failed) {
      console.log(`[db] v18: namespaced ${rewritten} queued set/event jobs, dropped ${dropped}, failed ${failed}`)
    }
  } catch (e) {
    console.warn('[db] v18 queue id rewrite skipped:', e?.message)
  }
})
