-- Migration: Create beach_competition_matches table for Competition Admin feature
-- This table stores pre-filled match templates that scorers can load into their app.

CREATE TABLE IF NOT EXISTS beach_competition_matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID REFERENCES auth.users(id),

  -- Competition grouping
  competition_name TEXT NOT NULL,

  -- Match identity
  game_n INTEGER,
  scheduled_at TIMESTAMPTZ,

  -- Match info (mirrors matches.match_info JSONB structure)
  match_info JSONB DEFAULT '{}'::jsonb,

  -- Team data (mirrors matches.team1_data / team2_data)
  team1_data JSONB DEFAULT '{}'::jsonb,
  team2_data JSONB DEFAULT '{}'::jsonb,

  -- Player rosters (mirrors matches.players_team1 / players_team2)
  players_team1 JSONB DEFAULT '[]'::jsonb,
  players_team2 JSONB DEFAULT '[]'::jsonb,

  -- Officials (mirrors matches.officials)
  officials JSONB DEFAULT '[]'::jsonb,

  -- Status tracking
  status TEXT DEFAULT 'template',
  claimed_by UUID REFERENCES auth.users(id),
  claimed_match_external_id TEXT,

  sport_type TEXT DEFAULT 'beach',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comp_matches_competition ON beach_competition_matches(competition_name);
CREATE INDEX IF NOT EXISTS idx_comp_matches_created_by ON beach_competition_matches(created_by);
CREATE INDEX IF NOT EXISTS idx_comp_matches_status ON beach_competition_matches(status);

-- Enable RLS
ALTER TABLE beach_competition_matches ENABLE ROW LEVEL SECURITY;

-- Admin/super_admin can do everything
CREATE POLICY "admin_all" ON beach_competition_matches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND (roles @> ARRAY['admin'] OR roles @> ARRAY['super_admin'])
    )
  );

-- Authenticated users can read (for loading into scorer app)
CREATE POLICY "authenticated_read" ON beach_competition_matches
  FOR SELECT USING (auth.role() = 'authenticated');

-- Authenticated users can update status to 'claimed' (for loading into scorer app)
CREATE POLICY "authenticated_claim" ON beach_competition_matches
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (status = 'claimed');
