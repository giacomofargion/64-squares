-- Migration: Remove authentication requirements and simplify RLS policies for guest-only access
-- This migration removes all auth.uid() checks and allows public access for guest players

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view matches they are part of" ON public.matches;
DROP POLICY IF EXISTS "Users can create matches" ON public.matches;
DROP POLICY IF EXISTS "Users can update matches they are part of" ON public.matches;
DROP POLICY IF EXISTS "Users can view moves in their matches" ON public.moves;
DROP POLICY IF EXISTS "Users can create moves in their matches" ON public.moves;
DROP POLICY IF EXISTS "Users can view messages in their matches" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can send messages in their matches" ON public.chat_messages;

-- Create simplified policies for guest-only access
-- Matches: Allow anyone to view, create, and update matches
CREATE POLICY "Anyone can view matches"
  ON public.matches FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create matches"
  ON public.matches FOR INSERT
  WITH CHECK (white_player_name IS NOT NULL);

CREATE POLICY "Anyone can update matches"
  ON public.matches FOR UPDATE
  USING (true);

-- Moves: Allow anyone to view and create moves
CREATE POLICY "Anyone can view moves"
  ON public.moves FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create moves"
  ON public.moves FOR INSERT
  WITH CHECK (player_name IS NOT NULL);

-- Chat messages: Allow anyone to view and send messages
CREATE POLICY "Anyone can view messages"
  ON public.chat_messages FOR SELECT
  USING (true);

CREATE POLICY "Anyone can send messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (user_name IS NOT NULL);
