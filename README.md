# 64 Squares - Music Chess App

A multiplayer chess application. 64 Squares is a virtual chess board which utilises an 8 note scale to represent the columns on a chess board: A, B (bflat in German), C, D, E, F G, H (b in German).
Each note of the scale has 8 variations in colour, to represent the ranks (rows) of the board. (eg D1, D2, D3, D4 etc), making in total 64 different but related sounds. As the pieces move around the board, they trigger various oscillators which have different durations, creating overlaps. The resulting harmony is more dissonant or consonant depending on the moves. When a piece is taken, all the notes on that row are triggered, creating a dissonant cluster of 8 notes.

## Features

- **Real-time Multiplayer**: Play chess online with friends using Supabase Realtime
- **Chat System**: Communicate with your opponent during matches
- **Synth Selection**: Choose from multiple synthesizer types (Synth, AMSynth, FMSynth, etc.)

### Row Variations (1-8)

Each row adds:

- **Octave offset**: Row 1 = -2 octaves, Row 8 = +2 octaves
- **Timbral variation**: Different synth parameters per row

## Tech Stack

- **Framework**: Next.js 14+ (App Router) with TypeScript
- **Database & Auth**: Supabase (PostgreSQL, Auth, Realtime, Storage)
- **Chess Logic**: chess.js
- **Audio**: Tone.js (PolySynth with user-selectable mono synths)
- **Styling**: Tailwind CSS v4
- **State Management**: React Hooks + Zustand

## Usage

1. **Create Match**: Choose your synth type and create a new match
2. **Join Match**: Enter a match ID to join an existing game
3. **Play**: Make moves to trigger musical sounds
4. **Chat**: Communicate with your opponent
5. **View History**: See all your past matches and download audio recordings

## Development

### Key Components

- **SoundGenerator**: Manages PolySynth and triggers notes
- **AudioEngine**: React hook for audio playback
- **ChessGame**: Wraps chess.js for game logic
- **Board**: Interactive chess board with drag-and-drop
- **useRealtimeMatch**: Hook for real-time match synchronization
