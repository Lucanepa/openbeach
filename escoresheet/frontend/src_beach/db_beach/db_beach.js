import Dexie from 'dexie'

/**
 * ============================================================================
 * LOCAL DATABASE SCHEMA (Dexie/IndexedDB)
 * ============================================================================
 *
 * This is the offline-first local database. All data is written here first,
 * then synced to Supabase via the sync_queue mechanism.
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
 * - status: 'queued' | 'sent' | 'error' - processing state
 *
 * Processing order: match → set → event (respects foreign key dependencies)
 *
 * EXTERNAL_ID PATTERN:
 * -------------------
 * All synced resources use external_id as the stable identifier:
 * - Match: seed_key (format: match_{timestamp}_{random})
 * - Set: Local Dexie ID as string
 * - Event: Local Dexie ID as string
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
  matches: '++id,homeTeamId,awayTeamId,scheduledAt,status,createdAt',
  sets: '++id,matchId,index,homePoints,awayPoints,finished',
  events: '++id,matchId,setIndex,ts,type,payload',
  sync_queue: '++id,resource,action,payload,ts,status' // status: queued|sent|error
})

// Version 2: Add signature fields to matches
db.version(2).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,homeTeamId,awayTeamId,scheduledAt,status,createdAt',
  sets: '++id,matchId,index,homePoints,awayPoints,finished',
  events: '++id,matchId,setIndex,ts,type,payload',
  sync_queue: '++id,resource,action,payload,ts,status'
}).upgrade(tx => {
  // Migration: add signature fields to existing matches
  return tx.table('matches').toCollection().modify(match => {
    if (!match.homeCoachSignature) match.homeCoachSignature = null
    if (!match.homeCaptainSignature) match.homeCaptainSignature = null
    if (!match.awayCoachSignature) match.awayCoachSignature = null
    if (!match.awayCaptainSignature) match.awayCaptainSignature = null
  })
})

// Version 3: Add match_setup table for storing draft data
db.version(3).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,homeTeamId,awayTeamId,scheduledAt,status,createdAt',
  sets: '++id,matchId,index,homePoints,awayPoints,finished',
  events: '++id,matchId,setIndex,ts,type,payload',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt' // Single record to store current draft
})

// Version 4: Add externalId index to matches
db.version(4).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,homeTeamId,awayTeamId,scheduledAt,status,createdAt,externalId',
  sets: '++id,matchId,index,homePoints,awayPoints,finished',
  events: '++id,matchId,setIndex,ts,type,payload',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt'
})

// Version 5: Add referees and scorers tables
db.version(5).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,homeTeamId,awayTeamId,scheduledAt,status,createdAt,externalId',
  sets: '++id,matchId,index,homePoints,awayPoints,finished',
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
  matches: '++id,homeTeamId,awayTeamId,scheduledAt,status,createdAt,externalId',
  sets: '++id,matchId,index,homePoints,awayPoints,finished,startTime,endTime',
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
  matches: '++id,homeTeamId,awayTeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,homePoints,awayPoints,finished,startTime,endTime',
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
  matches: '++id,homeTeamId,awayTeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,homePoints,awayPoints,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
})

// Version 9: Add homeTeamPin and awayTeamPin to matches
db.version(9).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,homeTeamId,awayTeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,homePoints,awayPoints,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
}).upgrade(tx => {
  // Migration: add team PIN fields to existing matches
  return tx.table('matches').toCollection().modify(match => {
    if (!match.homeTeamPin) match.homeTeamPin = null
    if (!match.awayTeamPin) match.awayTeamPin = null
  })
})

// Version 10: Add sessionId and gamePin to matches
db.version(10).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,homeTeamId,awayTeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,homePoints,awayPoints,finished,startTime,endTime',
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
  matches: '++id,homeTeamId,awayTeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,homePoints,awayPoints,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
}).upgrade(tx => {
  // Migration: add upload pin and pending roster fields to existing matches
  return tx.table('matches').toCollection().modify(match => {
    if (!match.homeTeamUploadPin) match.homeTeamUploadPin = null
    if (!match.awayTeamUploadPin) match.awayTeamUploadPin = null
    if (!match.pendingHomeRoster) match.pendingHomeRoster = null
    if (!match.pendingAwayRoster) match.pendingAwayRoster = null
  })
})

// Version 12: Add post-game captain signatures (separate from pre-game coin toss signatures)
db.version(12).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,homeTeamId,awayTeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,homePoints,awayPoints,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
}).upgrade(tx => {
  // Migration: add post-game captain signature fields to existing matches
  return tx.table('matches').toCollection().modify(match => {
    if (!match.homePostGameCaptainSignature) match.homePostGameCaptainSignature = null
    if (!match.awayPostGameCaptainSignature) match.awayPostGameCaptainSignature = null
  })
})

// Version 13: Add stateSnapshot to events for snapshot-based undo system
// Each event now stores a full state snapshot AFTER the event is applied
// This enables trivial undo (just restore previous snapshot) instead of complex per-event logic
db.version(13).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,homeTeamId,awayTeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,homePoints,awayPoints,finished,startTime,endTime',
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
  matches: '++id,homeTeamId,awayTeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,homePoints,awayPoints,finished,startTime,endTime',
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
  matches: '++id,homeTeamId,awayTeamId,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,homePoints,awayPoints,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq,stateSnapshot,[matchId+seq],[matchId+setIndex]',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt',
  interaction_logs: 'id,ts,gameNumber,category,sessionId'
})

// Version 16: Rename home/away to team1/team2 throughout
// This is a terminology change - beach volleyball uses Team 1/Team 2 not Home/Away
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
  // Migrate matches: homeTeamId → team1Id, awayTeamId → team2Id
  tx.table('matches').toCollection().modify(match => {
    match.team1Id = match.homeTeamId
    match.team2Id = match.awayTeamId
    delete match.homeTeamId
    delete match.awayTeamId
    // Rename signature fields
    match.team1CaptainSignature = match.homeCaptainSignature
    match.team2CaptainSignature = match.awayCaptainSignature
    match.team1CoachSignature = match.homeCoachSignature
    match.team2CoachSignature = match.awayCoachSignature
    delete match.homeCaptainSignature
    delete match.awayCaptainSignature
    delete match.homeCoachSignature
    delete match.awayCoachSignature
    // Rename PIN fields
    match.team1Pin = match.homeTeamPin
    match.team2Pin = match.awayTeamPin
    delete match.homeTeamPin
    delete match.awayTeamPin
    // Rename upload PIN fields
    match.team1UploadPin = match.homeTeamUploadPin
    match.team2UploadPin = match.awayTeamUploadPin
    delete match.homeTeamUploadPin
    delete match.awayTeamUploadPin
    // Rename pending roster fields
    match.pendingTeam1Roster = match.pendingHomeRoster
    match.pendingTeam2Roster = match.pendingAwayRoster
    delete match.pendingHomeRoster
    delete match.pendingAwayRoster
    // Rename post-game signature fields
    match.team1PostGameCaptainSignature = match.homePostGameCaptainSignature
    match.team2PostGameCaptainSignature = match.awayPostGameCaptainSignature
    delete match.homePostGameCaptainSignature
    delete match.awayPostGameCaptainSignature
  })
  // Migrate sets: homePoints → team1Points, awayPoints → team2Points
  tx.table('sets').toCollection().modify(set => {
    set.team1Points = set.homePoints
    set.team2Points = set.awayPoints
    delete set.homePoints
    delete set.awayPoints
  })
})


