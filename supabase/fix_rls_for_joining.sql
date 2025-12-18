-- Fix RLS policy to allow users to view waiting matches so they can join them
-- Run this in Supabase SQL Editor

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can view matches they are part of" ON public.matches;

-- Create updated policy that allows viewing waiting matches
CREATE POLICY "Users can view matches they are part of"
  ON public.matches FOR SELECT
  USING (
    auth.uid() = white_player_id OR
    auth.uid() = black_player_id OR
    -- Allow viewing waiting matches so users can join them
    (status = 'waiting' AND black_player_id IS NULL)
  );
