-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Matches table
CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  white_player_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  black_player_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  white_player_name TEXT, -- For guest players
  black_player_name TEXT, -- For guest players
  room_name TEXT, -- Custom room name from creator
  current_fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
  winner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  white_player_synth_type TEXT NOT NULL DEFAULT 'Synth' CHECK (white_player_synth_type IN ('Synth', 'AMSynth', 'FMSynth', 'DuoSynth', 'MonoSynth', 'MembraneSynth')),
  black_player_synth_type TEXT NOT NULL DEFAULT 'Synth' CHECK (black_player_synth_type IN ('Synth', 'AMSynth', 'FMSynth', 'DuoSynth', 'MonoSynth', 'MembraneSynth')),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  audio_file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  -- Ensure at least one player identifier exists (either ID or name)
  CONSTRAINT matches_player_check CHECK (
    (white_player_id IS NOT NULL) OR (white_player_name IS NOT NULL)
  )
);

-- Moves table
CREATE TABLE IF NOT EXISTS public.moves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  move_san TEXT NOT NULL,
  move_from TEXT NOT NULL,
  move_to TEXT NOT NULL,
  captured_piece TEXT,
  player_id UUID REFERENCES public.users(id) ON DELETE CASCADE, -- Nullable for guest players
  player_name TEXT, -- For guest players
  move_number INTEGER NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  -- Ensure at least one player identifier exists
  CONSTRAINT moves_player_check CHECK (
    (player_id IS NOT NULL) OR (player_name IS NOT NULL)
  )
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE, -- Nullable for guest players
  user_name TEXT, -- For guest players
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  -- Ensure at least one user identifier exists
  CONSTRAINT chat_messages_user_check CHECK (
    (user_id IS NOT NULL) OR (user_name IS NOT NULL)
  )
);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "Users can view their own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for matches
-- Allow public read access for guest rooms (matches with player names instead of IDs)
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

-- RLS Policies for moves
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

-- RLS Policies for chat_messages
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_matches_white_player ON public.matches(white_player_id);
CREATE INDEX IF NOT EXISTS idx_matches_black_player ON public.matches(black_player_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_moves_match_id ON public.moves(match_id);
CREATE INDEX IF NOT EXISTS idx_moves_player_id ON public.moves(player_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_match_id ON public.chat_messages(match_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);
