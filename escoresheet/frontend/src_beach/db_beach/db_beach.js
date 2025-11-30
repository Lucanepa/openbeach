import Dexie from 'dexie'
import { getSessionId } from '../utils_beach/session_beach'

// Get unique session ID for this browser/device
// This ensures each browser/device gets its own isolated database
const sessionId = getSessionId()

// Create session-specific database name
// This ensures complete data isolation between different browsers/devices
const dbName = `escoresheet_beach_${sessionId}`

export const db = new Dexie(dbName)

db.version(1).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team_1Id,team_2Id,scheduledAt,status,createdAt',
  sets: '++id,matchId,index,team_1Points,team_2Points,finished',
  events: '++id,matchId,setIndex,ts,type,payload',
  sync_queue: '++id,resource,action,payload,ts,status' // status: queued|sent|error
})

// Version 2: Add signature fields to matches
db.version(2).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team_1Id,team_2Id,scheduledAt,status,createdAt',
  sets: '++id,matchId,index,team_1Points,team_2Points,finished',
  events: '++id,matchId,setIndex,ts,type,payload',
  sync_queue: '++id,resource,action,payload,ts,status'
}).upgrade(tx => {
  // Migration: add signature fields to existing matches
  return tx.table('matches').toCollection().modify(match => {
    if (!match.team_1CoachSignature) match.team_1CoachSignature = null
    if (!match.team_1CaptainSignature) match.team_1CaptainSignature = null
    if (!match.team_2CoachSignature) match.team_2CoachSignature = null
    if (!match.team_2CaptainSignature) match.team_2CaptainSignature = null
  })
})

// Version 3: Add match_setup table for storing draft data
db.version(3).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team_1Id,team_2Id,scheduledAt,status,createdAt',
  sets: '++id,matchId,index,team_1Points,team_2Points,finished',
  events: '++id,matchId,setIndex,ts,type,payload',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt' // Single record to store current draft
})

// Version 4: Add externalId index to matches
db.version(4).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team_1Id,team_2Id,scheduledAt,status,createdAt,externalId',
  sets: '++id,matchId,index,team_1Points,team_2Points,finished',
  events: '++id,matchId,setIndex,ts,type,payload',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt'
})

// Version 5: Add referees and scorers tables
db.version(5).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team_1Id,team_2Id,scheduledAt,status,createdAt,externalId',
  sets: '++id,matchId,index,team_1Points,team_2Points,finished',
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
  matches: '++id,team_1Id,team_2Id,scheduledAt,status,createdAt,externalId',
  sets: '++id,matchId,index,team_1Points,team_2Points,finished,startTime,endTime',
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
  matches: '++id,team_1Id,team_2Id,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,team_1Points,team_2Points,finished,startTime,endTime',
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
  matches: '++id,team_1Id,team_2Id,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,team_1Points,team_2Points,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
})

// Version 9: Add team_1Pin and team_2Pin to matches
db.version(9).stores({
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team_1Id,team_2Id,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,team_1Points,team_2Points,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq',
  sync_queue: '++id,resource,action,payload,ts,status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt'
}).upgrade(tx => {
  // Migration: add team PIN fields to existing matches
  return tx.table('matches').toCollection().modify(match => {
    if (!match.team_1Pin) match.team_1Pin = null
    if (!match.team_2Pin) match.team_2Pin = null
  })
})


