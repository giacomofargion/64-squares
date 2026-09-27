# Functional tests for 64 Squares

These are **not** wired into `package.json`. The app still has no Jest/Vitest/Playwright dependency. The scripts here drive the real production build (`npm run build && PORT=3200 npx next start`) and, for the live suite, the real Supabase project.

## Prerequisites

1. A `.env.local` at the repo root with the **publishable** anon key (the same values the production site ships in its client bundle):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

`.env.local` is gitignored. Do not commit it.

2. Chrome at `/usr/local/bin/google-chrome` (or set `CHROME`).
3. `puppeteer-core` resolvable from `tests/`. Easiest:

```bash
ln -sfn /tmp/audio-probe/node_modules tests/node_modules
# or: cd tests && npm install puppeteer-core
```

`tests/node_modules` must not be committed.

## What to run

From the repo root, with the production server already listening on port 3200:

```bash
# Pure chess + room-code helpers (no network, no browser)
node tests/chess-logic.test.mjs
node tests/room-code.test.mjs

# Row-level security: DELETE is a silent no-op under the anon key
node tests/db-rls.test.mjs

# Two headful Chrome windows against the live backend (full sweep)
DISPLAY=:1 ORIGIN=http://127.0.0.1:3200 node tests/live/run.mjs

# Focused re-run of join / rejoin / third-player / chat / sessionStorage
DISPLAY=:1 ORIGIN=http://127.0.0.1:3200 node tests/live/joining-and-chat.mjs
```

Reports are written under `/tmp/64squares-tests/` (`live-report.json`, `db-rls.json`, screenshots if you add them).

`MOVE_GAP_MS` (default 1800) controls the pace of the 12-ply realtime/audio game.

Room names created by these scripts use the prefix `autotest-<timestamp>`. The anon key cannot delete them (see the RLS test); clean up with the SQL at the end of the test report.

## What this is for

The live driver covers guest room create/join, turn enforcement, special moves, checkmate, restart/end room, chat, reload, solo mode, the cron route, and the four recent fixes: realtime callback refs, FEN-driven opponent sound, `getHalfMoveCount` starting at 1, and DualSynth disposal no longer tearing down both players' ringing notes.
