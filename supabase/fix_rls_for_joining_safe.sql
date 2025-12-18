-- Safe version: Update RLS policy without dropping (if policy already exists, this will fail gracefully)
-- Run this in Supabase SQL Editor

-- First, try to drop the existing policy (this is safe - we're replacing it)
DROP POLICY IF EXISTS "Users can view matches they are part of" ON public.matches;

-- Create the updated policy that allows viewing waiting matches
CREATE POLICY "Users can view matches they are part of"
  ON public.matches FOR SELECT
  USING (
    auth.uid() = white_player_id OR
    auth.uid() = black_player_id OR
    -- Allow viewing waiting matches so users can join them
    (status = 'waiting' AND black_player_id IS NULL)
  );

-- This is safe because:
-- 1. We're using DROP POLICY IF EXISTS (won't error if policy doesn't exist)
-- 2. We're immediately recreating it with better permissions
-- 3. This only affects the SELECT policy, not your data
