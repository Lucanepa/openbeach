-- Migration: Add team1_points and team2_points columns to sets table
-- Run this in Supabase SQL Editor if your sets table is missing these columns
--
-- Error this fixes: PGRST204 - Could not find the 'team1_points' column of 'sets' in the schema cache

ALTER TABLE sets ADD COLUMN IF NOT EXISTS team1_points INTEGER DEFAULT 0;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS team2_points INTEGER DEFAULT 0;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
