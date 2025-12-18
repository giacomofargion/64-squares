-- Migration: Add guest player fields and room_name to matches table
-- Run this on existing databases to add the new columns

-- Add new columns (nullable to support existing data)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS white_player_name TEXT,
  ADD COLUMN IF NOT EXISTS black_player_name TEXT,
  ADD COLUMN IF NOT EXISTS room_name TEXT;

-- Make white_player_id nullable (was NOT NULL before)
-- This allows guest players to create matches without user accounts
ALTER TABLE public.matches
  ALTER COLUMN white_player_id DROP NOT NULL;

-- Add constraint to ensure at least one player identifier exists
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_player_check;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_player_check CHECK (
    (white_player_id IS NOT NULL) OR (white_player_name IS NOT NULL)
  );

-- Update moves table for guest support
ALTER TABLE public.moves
  ADD COLUMN IF NOT EXISTS player_name TEXT,
  ALTER COLUMN player_id DROP NOT NULL;

ALTER TABLE public.moves
  DROP CONSTRAINT IF EXISTS moves_player_check;

ALTER TABLE public.moves
  ADD CONSTRAINT moves_player_check CHECK (
    (player_id IS NOT NULL) OR (player_name IS NOT NULL)
  );

-- Update chat_messages table for guest support
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS user_name TEXT,
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_user_check;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_user_check CHECK (
    (user_id IS NOT NULL) OR (user_name IS NOT NULL)
  );

-- Update RLS policies to allow guest access
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view matches they are part of" ON public.matches;
DROP POLICY IF EXISTS "Users can create matches" ON public.matches;
DROP POLICY IF EXISTS "Users can update matches they are part of" ON public.matches;
DROP POLICY IF EXISTS "Users can view moves in their matches" ON public.moves;
DROP POLICY IF EXISTS "Users can create moves in their matches" ON public.moves;
DROP POLICY IF EXISTS "Users can view messages in their matches" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can send messages in their matches" ON public.chat_messages;

-- Recreate match policies with guest support
CREATE POLICY "Users can view matches they are part of"
  ON public.matches FOR SELECT
  USING (
    auth.uid() = white_player_id OR
    auth.uid() = black_player_id OR
    -- Allow viewing waiting matches so users can join them
    (status = 'waiting' AND black_player_id IS NULL AND black_player_name IS NULL) OR
    -- Allow viewing guest matches (matches with player names)
    (white_player_name IS NOT NULL OR black_player_name IS NOT NULL)
  );

CREATE POLICY "Users can create matches"
  ON public.matches FOR INSERT
  WITH CHECK (
    -- Authenticated users must be the white player
    (auth.uid() = white_player_id AND white_player_id IS NOT NULL) OR
    -- Guest users can create matches with white_player_name
    (white_player_name IS NOT NULL AND white_player_id IS NULL)
  );

CREATE POLICY "Users can update matches they are part of"
  ON public.matches FOR UPDATE
  USING (
    auth.uid() = white_player_id OR
    auth.uid() = black_player_id OR
    -- Allow updates to guest matches (for joining)
    (white_player_name IS NOT NULL OR black_player_name IS NOT NULL)
  );

-- Recreate moves policies with guest support
CREATE POLICY "Users can view moves in their matches"
  ON public.moves FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.matches
      WHERE matches.id = moves.match_id
      AND (
        matches.white_player_id = auth.uid() OR
        matches.black_player_id = auth.uid() OR
        -- Allow viewing moves in guest matches
        (matches.white_player_name IS NOT NULL OR matches.black_player_name IS NOT NULL)
      )
    )
  );

CREATE POLICY "Users can create moves in their matches"
  ON public.moves FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.matches
      WHERE matches.id = moves.match_id
      AND (
        matches.white_player_id = auth.uid() OR
        matches.black_player_id = auth.uid() OR
        -- Allow creating moves in guest matches
        (matches.white_player_name IS NOT NULL OR matches.black_player_name IS NOT NULL)
      )
    ) AND (
      -- Authenticated users must use player_id
      (auth.uid() = player_id AND player_id IS NOT NULL) OR
      -- Guest users must use player_name
      (player_name IS NOT NULL AND player_id IS NULL)
    )
  );

-- Recreate chat_messages policies with guest support
CREATE POLICY "Users can view messages in their matches"
  ON public.chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.matches
      WHERE matches.id = chat_messages.match_id
      AND (
        matches.white_player_id = auth.uid() OR
        matches.black_player_id = auth.uid() OR
        -- Allow viewing messages in guest matches
        (matches.white_player_name IS NOT NULL OR matches.black_player_name IS NOT NULL)
      )
    )
  );

CREATE POLICY "Users can send messages in their matches"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.matches
      WHERE matches.id = chat_messages.match_id
      AND (
        matches.white_player_id = auth.uid() OR
        matches.black_player_id = auth.uid() OR
        -- Allow sending messages in guest matches
        (matches.white_player_name IS NOT NULL OR matches.black_player_name IS NOT NULL)
      )
    ) AND (
      -- Authenticated users must use user_id
      (auth.uid() = user_id AND user_id IS NOT NULL) OR
      -- Guest users must use user_name
      (user_name IS NOT NULL AND user_id IS NULL)
    )
  );
