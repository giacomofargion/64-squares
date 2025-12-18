# 64 Squares - Music Chess App

A multiplayer chess application where each move generates musical sounds, creating a unique audio experience. Each square on the board corresponds to a musical note, and moves trigger overlapping 20-second sounds that create harmonies based on the game state.

## Features

- **Musical Chess**: Each of the 64 squares maps to a unique note based on its position
- **Real-time Multiplayer**: Play chess online with friends using Supabase Realtime
- **Chat System**: Communicate with your opponent during matches
- **Synth Selection**: Choose from multiple synthesizer types (Synth, AMSynth, FMSynth, etc.)
- **Audio Recording**: Games are recorded as WAV files and stored in your account
- **Match History**: View and download recordings of all your past games

## Musical System

### Column-to-Note Mapping (A-H)
- A → A (440 Hz)
- B → B♭ (466.16 Hz)
- C → C (523.25 Hz)
- D → D (587.33 Hz)
- E → E (659.25 Hz)
- F → F (698.46 Hz)
- G → G (783.99 Hz)
- H → B (493.88 Hz)

### Row Variations (1-8)
Each row adds:
- **Octave offset**: Row 1 = -2 octaves, Row 8 = +2 octaves
- **Timbral variation**: Different synth parameters per row

### Sound Events
- **Moves**: Each move triggers a 20-second sustained note
- **Captures**: When a piece is captured, all 8 notes in that row play with a 50ms stagger

## Tech Stack

- **Framework**: Next.js 14+ (App Router) with TypeScript
- **Database & Auth**: Supabase (PostgreSQL, Auth, Realtime, Storage)
- **Chess Logic**: chess.js
- **Audio**: Tone.js (PolySynth with user-selectable mono synths)
- **Styling**: Tailwind CSS v4
- **State Management**: React Hooks + Zustand

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Supabase account (free tier works)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd 64-squares
```

2. Install dependencies:
```bash
npm install
```

3. Set up Supabase:
   - Create a new Supabase project at [supabase.com](https://supabase.com)
   - Copy your project URL and anon key
   - Create a `.env.local` file:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

4. Set up the database:
   - Go to your Supabase project dashboard
   - Navigate to SQL Editor
   - Copy and paste the contents of `supabase/schema.sql`
   - Run the SQL script

5. Enable Realtime:
   - Go to Database > Replication
   - Enable replication for: `matches`, `moves`, `chat_messages` tables

6. Create Storage bucket:
   - Go to Storage in Supabase dashboard
   - Create a bucket named `audio-files`
   - Set it to public (or configure RLS for authenticated access)

7. Run the development server:
```bash
npm run dev
```

8. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
/app
  /(auth)          # Authentication pages
  /(dashboard)     # Protected dashboard pages
  /api             # API routes
/components
  /chess           # Chess board components
  /audio           # Audio engine and recording
  /chat            # Chat components
  /match           # Match-related components
/lib
  /supabase        # Supabase client setup
  /chess           # Chess game logic
  /audio           # Audio mapping and synth config
/hooks             # Custom React hooks
/types             # TypeScript type definitions
```

## Usage

1. **Sign Up/Login**: Create an account or sign in
2. **Create Match**: Choose your synth type and create a new match
3. **Join Match**: Enter a match ID to join an existing game
4. **Play**: Make moves to trigger musical sounds
5. **Chat**: Communicate with your opponent
6. **View History**: See all your past matches and download audio recordings

## Development

### Key Components

- **SoundGenerator**: Manages PolySynth and triggers notes
- **AudioEngine**: React hook for audio playback
- **ChessGame**: Wraps chess.js for game logic
- **Board**: Interactive chess board with drag-and-drop
- **useRealtimeMatch**: Hook for real-time match synchronization

### Audio Recording

Games are recorded using Tone.js OfflineContext, which replays all moves to generate a WAV file. The recording is uploaded to Supabase Storage when the game ends.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
