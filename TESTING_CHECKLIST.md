# Testing Checklist for 64 Squares

## ✅ Completed Features

### Core Infrastructure
- [x] Next.js 14+ setup with TypeScript
- [x] Supabase integration (database, auth, realtime, storage)
- [x] Database schema with RLS policies
- [x] Authentication system (signup/login)
- [x] Landing page

### Audio System
- [x] Note mapping (A-H columns → musical notes)
- [x] Row variations (octaves + timbres)
- [x] SoundGenerator with PolySynth
- [x] AudioEngine React hook
- [x] Synth selector component
- [x] 20-second overlapping sounds
- [x] Row-wide capture events with stagger

### Chess Game
- [x] Chess.js integration
- [x] Chess board UI with drag-and-drop
- [x] Legal move highlighting
- [x] Move validation
- [x] Game state management

### Multiplayer
- [x] Real-time match synchronization
- [x] Chat system with real-time messages
- [x] Match creation and joining
- [x] Per-player synth selection

### UI/UX
- [x] Match lobby
- [x] Match room with board and chat
- [x] Match history page
- [x] Responsive design

## 🧪 Testing Checklist

### 1. Landing Page & Navigation
- [ ] Landing page displays correctly
- [ ] "Get Started" button works for new users
- [ ] "Sign In" button works
- [ ] Navigation shows correct links based on auth state
- [ ] Page is responsive on mobile/tablet

### 2. Authentication
- [ ] Can sign up with email/password/username
- [ ] User profile is created in database
- [ ] Can sign in with correct credentials
- [ ] Sign in fails with wrong credentials (shows error)
- [ ] Sign out works correctly
- [ ] Protected routes redirect to login when not authenticated

### 3. Match Creation & Joining
- [ ] Can create a new match
- [ ] Synth selector works (can choose different synth types)
- [ ] Match ID is generated
- [ ] Can join match with valid match ID
- [ ] Join fails with invalid match ID (shows error)
- [ ] Match status updates correctly (waiting → active)

### 4. Chess Gameplay
- [ ] Board displays correctly with pieces
- [ ] Can drag and drop pieces
- [ ] Can click to select and move pieces
- [ ] Legal moves are highlighted
- [ ] Illegal moves are rejected
- [ ] Last move is highlighted
- [ ] Game state updates correctly (check, checkmate, stalemate)
- [ ] Turn indicators work correctly
- [ ] Board orientation is correct (white/black perspective)

### 5. Audio System
- [ ] Audio context initializes (may require user interaction)
- [ ] Sounds play when making moves
- [ ] Each square produces correct note
- [ ] Sounds overlap correctly (20-second duration)
- [ ] Capture events trigger row-wide sounds with stagger
- [ ] Different synth types produce different sounds
- [ ] Volume is appropriate (not too loud/quiet)
- [ ] No audio glitches or clipping

### 6. Real-time Multiplayer
- [ ] Moves sync between players in real-time
- [ ] Opponent's moves appear on your board
- [ ] Chat messages appear in real-time
- [ ] Can send chat messages
- [ ] Match state updates in real-time (status, FEN)
- [ ] Works with two different browsers/devices

### 7. Chat System
- [ ] Can type and send messages
- [ ] Messages display with username
- [ ] Messages show timestamp
- [ ] Own messages are styled differently
- [ ] Chat scrolls to bottom on new messages
- [ ] Empty state shows when no messages

### 8. Match History
- [ ] Can view list of past matches
- [ ] Matches show correct status (waiting/active/finished)
- [ ] Can see match details (players, dates, synth types)
- [ ] Can download audio files (if available)
- [ ] Can continue active matches
- [ ] History is filtered to user's matches only

### 9. Audio Recording (Future)
- [ ] Audio recording triggers when game ends
- [ ] WAV file is generated correctly
- [ ] File is uploaded to Supabase Storage
- [ ] Download link appears in match history
- [ ] Can download and play WAV file

### 10. Error Handling
- [ ] Network errors are handled gracefully
- [ ] Database errors show user-friendly messages
- [ ] Invalid moves show feedback
- [ ] Loading states display correctly
- [ ] No console errors in browser

### 11. Performance
- [ ] Page loads quickly
- [ ] Audio doesn't cause lag
- [ ] Real-time updates are responsive
- [ ] No memory leaks (check with browser dev tools)
- [ ] Works smoothly with many overlapping sounds

### 12. Edge Cases
- [ ] Can handle rapid moves
- [ ] Works when opponent disconnects
- [ ] Handles game end states correctly
- [ ] Works with very long games
- [ ] Handles browser refresh during match

## 🐛 Known Issues to Test

1. **User Profile Creation**: Ensure signup always creates profile in `users` table
2. **Audio Initialization**: May require user interaction (click) to start audio
3. **RLS Policies**: Verify all database operations respect RLS
4. **Realtime Subscriptions**: Test that subscriptions work correctly

## 📝 Testing Notes

### Single-Player Mode
- Currently not implemented - matches require two players
- Consider adding: Allow `black_player_id` to be same as `white_player_id` for solo play

### Guest Mode
- Currently requires authentication
- Consider adding: Allow playing without account (local storage only)

## 🚀 Next Steps After Testing

1. Fix any bugs found during testing
2. Implement audio recording feature
3. Add single-player mode
4. Add guest mode (optional)
5. Optimize audio performance
6. Add more synth options
7. Improve error messages
8. Add loading states
9. Add animations/transitions
10. Deploy to production
