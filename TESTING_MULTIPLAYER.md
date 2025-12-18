# Testing Multiplayer - Quick Guide

## Option 1: Test with Two Different Accounts (Recommended)

### Step 1: Create First Account
1. On your first device/browser, go to `/signup`
2. Create an account with email: `test1@example.com` (or any email)
3. Go to `/matches`
4. Select a synth type
5. Click "Create Match"
6. **Copy the match ID** from the URL or alert message

### Step 2: Create Second Account
1. On your second device/browser (or incognito window), go to `/signup`
2. Create a **different** account with email: `test2@example.com` (must be different!)
3. Go to `/matches`
4. Select a synth type
5. Paste the match ID from Step 1
6. Click "Join Match"

### Step 3: Play!
- Both players should now be in the same match
- Moves will sync in real-time
- Chat messages will appear for both players

## Option 2: Test with Same Account (Limited)

If you want to test with the same account on two devices:

1. **Device 1**: Create match and note the match ID
2. **Device 2**:
   - Sign in with the same account
   - Try to join the match
   - You should be redirected to the match (since you're already the white player)
   - **Note**: You won't be able to play as black with the same account

## Troubleshooting

### "Match not found"
- Check that you copied the full match ID (it's a UUID, looks like: `7f8fcbfa-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
- Make sure there are no extra spaces
- Verify the match exists in Supabase dashboard

### "Match is not waiting for players"
- The match might have already been joined
- Check the match status in Supabase
- Create a new match

### "Match is full"
- Both player slots are taken
- Create a new match

### Real-time not working
- Make sure Realtime is enabled in Supabase for `matches`, `moves`, and `chat_messages` tables
- Check browser console for WebSocket errors
- Try refreshing both browsers

## Quick Test Checklist

- [ ] Two different accounts created
- [ ] Match created on device 1
- [ ] Match ID copied
- [ ] Match joined on device 2
- [ ] Both players see the same board
- [ ] Moves sync in real-time
- [ ] Chat messages appear for both players
- [ ] Audio plays on both devices
