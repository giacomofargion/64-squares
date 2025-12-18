-- Enable Realtime for tables
-- Run this in Supabase SQL Editor after running schema.sql
-- This script is idempotent - safe to run multiple times

-- Check current status
SELECT
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('matches', 'moves', 'chat_messages')
ORDER BY tablename;

-- Add tables to the supabase_realtime publication (only if not already added)
DO $$
BEGIN
  -- Add matches table if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
    RAISE NOTICE 'Added matches table to publication';
  ELSE
    RAISE NOTICE 'matches table already in publication';
  END IF;

  -- Add moves table if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'moves'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.moves;
    RAISE NOTICE 'Added moves table to publication';
  ELSE
    RAISE NOTICE 'moves table already in publication';
  END IF;

  -- Add chat_messages table if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
    RAISE NOTICE 'Added chat_messages table to publication';
  ELSE
    RAISE NOTICE 'chat_messages table already in publication';
  END IF;
END $$;

-- Verify the tables are in the publication
SELECT
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('matches', 'moves', 'chat_messages')
ORDER BY tablename;
