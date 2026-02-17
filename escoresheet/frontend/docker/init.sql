-- OpenBeach PostgreSQL Schema (Synology)
-- Compatible with Supabase schema for dual-sync
--
-- This schema mirrors the Supabase database structure so that
-- the same sync code can work with both backends.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- MATCHES TABLE
-- Main table storing match metadata, teams, players, officials, etc.
-- Uses JSONB columns for flexible nested data (same as Supabase)
-- =============================================================================
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id TEXT UNIQUE NOT NULL,  -- Stable identifier for sync (seed_key)
  sport_type TEXT DEFAULT 'beach',   -- Filter for beach volleyball

  -- Basic match info
  game_n INTEGER,                     -- Game number in tournament
  game_pin TEXT,                      -- 6-digit PIN for connections
  status TEXT DEFAULT 'created',      -- created, setup, live, finished
  scheduled_at TIMESTAMPTZ,

  -- JSONB columns for flexible data storage
  match_info JSONB DEFAULT '{}',      -- hall, city, league, championship_type
  officials JSONB DEFAULT '[]',       -- referees, scorers, line judges
  team1_team JSONB,                   -- { name, short_name, color }
  team2_team JSONB,                   -- { name, short_name, color }
  players_team1 JSONB DEFAULT '[]',   -- Array of player objects
  players_team2 JSONB DEFAULT '[]',   -- Array of player objects
  coin_toss JSONB DEFAULT '{}',       -- Coin toss results
  connections JSONB DEFAULT '{}',     -- Connection settings
  connection_pins JSONB DEFAULT '{}', -- PINs for various connections
  results JSONB DEFAULT '{}',         -- Match results
  signatures JSONB DEFAULT '{}',      -- Captain/official signatures
  approval JSONB DEFAULT '{}',        -- Approval status
  set_results JSONB DEFAULT '[]',     -- Results per set
  sanctions JSONB DEFAULT '[]',       -- Sanctions/cards issued
  manual_changes JSONB DEFAULT '[]',  -- Manual score/event changes

  -- Scalar result fields
  current_set INTEGER DEFAULT 1,
  final_score TEXT,
  winner TEXT,                        -- 'team1', 'team2', or null

  -- Metadata
  test BOOLEAN DEFAULT false,         -- Test match flag
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SETS TABLE
-- Stores set scores and timing for each set in a match
-- =============================================================================
CREATE TABLE sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id TEXT UNIQUE NOT NULL,   -- Stable identifier for sync
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,

  index INTEGER NOT NULL,             -- Set number (1, 2, 3)
  team1_points INTEGER DEFAULT 0,
  team2_points INTEGER DEFAULT 0,
  finished BOOLEAN DEFAULT false,

  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- EVENTS TABLE
-- Stores all match events (points, timeouts, sanctions, etc.)
-- =============================================================================
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id TEXT UNIQUE NOT NULL,   -- Stable identifier for sync
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,

  set_index INTEGER,                  -- Which set this event belongs to
  type TEXT NOT NULL,                 -- point, timeout, sanction, lineup, etc.
  payload JSONB,                      -- Event-specific data
  ts TIMESTAMPTZ,                     -- Timestamp of event
  seq INTEGER,                        -- Sequence number for ordering

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- MATCH_LIVE_STATE TABLE
-- Real-time state for live spectator display
-- Updated frequently during match (direct writes, not queued)
-- =============================================================================
CREATE TABLE match_live_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID UNIQUE REFERENCES matches(id) ON DELETE CASCADE,

  -- Current scores
  current_set INTEGER DEFAULT 1,
  points_a INTEGER DEFAULT 0,
  points_b INTEGER DEFAULT 0,
  sets_won_a INTEGER DEFAULT 0,
  sets_won_b INTEGER DEFAULT 0,

  -- Team info
  team_a_name TEXT,
  team_b_name TEXT,
  side_a TEXT DEFAULT 'left',         -- Which side Team A is on

  -- Lineups (JSONB with position -> player mapping)
  lineup_a JSONB,
  lineup_b JSONB,

  -- Current state
  serving_team TEXT,                  -- 'A' or 'B'
  rally_state TEXT DEFAULT 'idle',    -- idle, serving, playing

  -- Sanctions and timeouts
  sanctions_a JSONB DEFAULT '[]',
  sanctions_b JSONB DEFAULT '[]',
  timeouts_a JSONB DEFAULT '[]',
  timeouts_b JSONB DEFAULT '[]',

  -- Match status
  status TEXT DEFAULT 'live',

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- Performance optimization for common queries
-- =============================================================================
CREATE INDEX idx_matches_external_id ON matches(external_id);
CREATE INDEX idx_matches_game_pin ON matches(game_pin);
CREATE INDEX idx_matches_sport_type ON matches(sport_type);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_created_at ON matches(created_at DESC);

CREATE INDEX idx_sets_match_id ON sets(match_id);
CREATE INDEX idx_sets_external_id ON sets(external_id);

CREATE INDEX idx_events_match_id ON events(match_id);
CREATE INDEX idx_events_external_id ON events(external_id);
CREATE INDEX idx_events_match_seq ON events(match_id, seq);

CREATE INDEX idx_match_live_state_match_id ON match_live_state(match_id);

-- =============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_match_live_state_updated_at
  BEFORE UPDATE ON match_live_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- GRANT PERMISSIONS
-- PostgREST connects as the openbeach role
-- =============================================================================
GRANT ALL ON ALL TABLES IN SCHEMA public TO openbeach;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO openbeach;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO openbeach;
