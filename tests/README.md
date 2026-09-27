# Tests

## `npm test`

Offline Vitest suite. It checks chess rules and room codes. It does not open a browser, start Next.js, or talk to Supabase, so it finishes in a few seconds.

`tests/game.test.ts` covers `getHalfMoveCount` (the start position is 0, e4 is 1, e5 is 2, and a game loaded from a mid-game FEN uses that FEN rather than chess.js history), `findConnectingMove` (one legal step, including a capture; identical positions; more than one move apart; garbage FEN), kingside castling, en passant, and auto-queen promotion.

`tests/roomCode.test.ts` covers the pure helpers in `lib/roomCode.ts`: the 7-character code shape and UUID checks. `findMatchByCode` and `normalizeRoomCode` take a Supabase client, so these tests pass a small in-memory stand-in. A value that is neither a UUID nor 7 hex digits returns null before that stand-in is asked anything. No test opens a network connection.

## `npm run test:realtime`

Needs Chrome at `/usr/local/bin/google-chrome`. Set `CHROME_PATH` if the binary is somewhere else. It does not need Supabase, `.env.local`, or a running Next.js server. The script bundles the real match page and points two headless Chrome windows at a fake PostgREST and Realtime server in the test process.

The default run plays 1. e4 e5 2. Nf3 Nc6 with about 100ms of network latency. On half-move 3 (Nf3) it drops the `moves` INSERT that Black would have received. The match-row update still arrives, and Black should hear the note from that update. That is the regression lock for the opponent-sound bug. Move numbers saved in the fake database must be 1, 2, 3, 4.

The command exits non-zero when any of these happen:

- The two devices did not each join a realtime channel exactly once (two joins total).
- Either device spent any sampled moment of the game with no active subscription. Sampling starts once both devices are subscribed, so the initial page load is not counted.
- The listener did not hear the note for the move whose INSERT was dropped.
- Move numbers in the fake database do not start at 1.

Optional environment variables: `LATENCY_MS` (default 100), `MIN_INTERVAL_MS` (default 400), `MAX_INTERVAL_MS` (default 4000), `ACTIVATION_MS` (default 0), `DROP_INSERT_ON_HALFMOVE` (default 3, and it must be a ply in this short game).

## Live Supabase tests

`tests/live/` and `tests/db-rls.test.mjs` talk to a real Supabase project. They are intentionally not the default. They are timing-dependent, and they cannot clean up the rows they create: with the anon key, DELETE is a silent no-op because those tables have no DELETE policy.

They need `.env.local`. The browser scripts also need a production build already listening, and Chrome (`CHROME`, default `/usr/local/bin/google-chrome`):

```bash
node tests/db-rls.test.mjs
DISPLAY=:1 ORIGIN=http://127.0.0.1:3200 node tests/live/run.mjs
DISPLAY=:1 ORIGIN=http://127.0.0.1:3200 node tests/live/joining-and-chat.mjs
```

Room names from those scripts use the prefix `autotest-<timestamp>`. Clean them up with the SQL printed at the end of the report.
