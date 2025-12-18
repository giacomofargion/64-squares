-- Migration: Add PluckSynth to synth type CHECK constraints

-- Drop existing constraints
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_white_player_synth_type_check;

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_black_player_synth_type_check;

-- Add new constraints with PluckSynth included
ALTER TABLE public.matches
  ADD CONSTRAINT matches_white_player_synth_type_check
  CHECK (white_player_synth_type IN ('Synth', 'AMSynth', 'FMSynth', 'DuoSynth', 'MonoSynth', 'MembraneSynth', 'PluckSynth'));

ALTER TABLE public.matches
  ADD CONSTRAINT matches_black_player_synth_type_check
  CHECK (black_player_synth_type IN ('Synth', 'AMSynth', 'FMSynth', 'DuoSynth', 'MonoSynth', 'MembraneSynth', 'PluckSynth'));
