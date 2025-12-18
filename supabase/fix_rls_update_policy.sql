-- Fix RLS UPDATE policy to allow users to join waiting matches
-- Run this in Supabase SQL Editor

-- Drop the existing UPDATE policy
DROP POLICY IF EXISTS "Users can update matches they are part of" ON public.matches;

-- Create updated policy that allows joining waiting matches
CREATE POLICY "Users can update matches they are part of"
  ON public.matches FOR UPDATE
  USING (
    auth.uid() = white_player_id OR
    auth.uid() = black_player_id OR
    -- Allow users to update waiting matches to join them (set themselves as black_player)
    (status = 'waiting' AND black_player_id IS NULL)
  )
  WITH CHECK (
    auth.uid() = white_player_id OR
    auth.uid() = black_player_id OR
    -- Allow setting yourself as black_player if match is waiting
    (status = 'waiting' AND black_player_id IS NULL)
  );

-- This allows:
-- 1. Users already in the match to update it
-- 2. New users to join waiting matches by setting themselves as black_player
