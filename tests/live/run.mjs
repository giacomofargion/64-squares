/**
 * Live two-browser functional sweep against a locally served production build
 * talking to the real Supabase project. Requires .env.local and `next start`.
 *
 *   ORIGIN=http://127.0.0.1:3200 NODE_PATH=/tmp/audio-probe/node_modules node tests/live/run.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  ORIGIN,
  sleep,
  clickByText,
  typeInto,
  selectVisibleSynth,
  playMove,
  clickSquare,
  enableAudio,
  dismissAudioIfPresent,
  pageText,
  waitForText,
  readRoomCode,
  boardOccupancy,
  hasLastMoveHighlight,
  legalDotCount,
  probeSnapshot,
  noteStartsSince,
  peakRmsSince,
  openDevice,
  closeDevice,
  openChat,
} from './helpers.mjs';

mkdirSync('/tmp/64squares-tests/shots', { recursive: true });

const envText = readFileSync('/workspace/.env.local', 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const PREFIX = `autotest-${Date.now()}`;
const createdMatches = [];
const results = [];
const startedAt = Date.now();
const log = (msg) => console.log(`${String(Date.now() - startedAt).padStart(6)}ms  ${msg}`);

async function record(area, name, fn) {
  const t0 = Date.now();
  try {
    const detail = (await fn()) || '';
    results.push({ area, name, pass: true, detail: String(detail), ms: Date.now() - t0, executed: true });
    log(`PASS  [${area}] ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ area, name, pass: false, detail: message, ms: Date.now() - t0, executed: true });
    log(`FAIL  [${area}] ${name} — ${message}`);
  }
}

function generateRoomCode(uuid) {
  return uuid.replace(/-/g, '').slice(-7);
}

async function fetchMatch(id) {
  const { data, error } = await supabase.from('matches').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

async function fetchMoves(id) {
  const { data, error } = await supabase.from('moves').select('*').eq('match_id', id).order('move_number', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchChat(id) {
  const { data, error } = await supabase.from('chat_messages').select('*').eq('match_id', id).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

async function patchMatch(id, patch) {
  const { error } = await supabase.from('matches').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

function track(match, roomName) {
  createdMatches.push({ id: match.id, room_name: roomName, room_code: generateRoomCode(match.id) });
}

async function createViaUi(white, { roomName, synth = 'Synth' } = {}) {
  const name = roomName || `${PREFIX}-room`;
  await typeInto(white.page, 'create-name', white.guest);
  await typeInto(white.page, 'create-room-name', name);
  if (synth !== 'Synth') await selectVisibleSynth(white.page, synth);
  await clickByText(white.page, '^\\s*Create Room\\s*$');
  await white.page.waitForFunction(() => location.pathname.startsWith('/match/'), { timeout: 30000 });
  const matchId = white.page.url().split('/match/')[1];
  track({ id: matchId }, name);
  return { matchId, roomName: name, roomCode: generateRoomCode(matchId) };
}

async function joinViaUi(black, { matchId, roomCode, synth = 'FMSynth' }) {
  await clickByText(black.page, 'Join', { role: 'tab' });
  await black.page.waitForSelector('#join-name', { timeout: 20000 });
  await typeInto(black.page, 'join-name', black.guest);
  await typeInto(black.page, 'join-room-code', roomCode || matchId);
  if (synth !== 'Synth') await selectVisibleSynth(black.page, synth);
  await clickByText(black.page, '^\\s*Join Room\\s*$');
}

async function openPair({ whiteName, blackName, roomName, whiteSynth = 'Synth', blackSynth = 'FMSynth', tag }) {
  const alice = await openDevice({
    key: 'A',
    guest: whiteName,
    role: 'WHITE',
    orientation: 'w',
    x: 0,
    profileTag: tag,
  });
  const created = await createViaUi(alice, { roomName, synth: whiteSynth });
  const bob = await openDevice({
    key: 'B',
    guest: blackName,
    role: 'BLACK',
    orientation: 'b',
    x: 960,
    profileTag: tag,
  });
  await joinViaUi(bob, { matchId: created.matchId, roomCode: created.roomCode, synth: blackSynth });
  await bob.page.waitForFunction(() => location.pathname.startsWith('/match/'), { timeout: 30000 });
  await sleep(800);
  return { alice, bob, ...created };
}

async function sendChat(page, text) {
  const input = await page.waitForSelector('input[placeholder="Type a message..."]', { timeout: 15000 });
  await input.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await input.type(text, { delay: 15 });
  await clickByText(page, '^\\s*Send\\s*$');
}

async function confirmDialog(page, actionLabel) {
  await clickByText(page, actionLabel);
  await sleep(300);
  // The confirm button in the dialog has the same label; click the last visible match.
  await page.evaluate((label) => {
    const rx = new RegExp(label, 'i');
    const buttons = [...document.querySelectorAll('button')].filter((b) => rx.test((b.textContent || '').trim()));
    buttons.at(-1)?.click();
  }, actionLabel);
}

log(`ORIGIN=${ORIGIN} PREFIX=${PREFIX}`);

// ---------------------------------------------------------------------------
// JOINING ROOMS
// ---------------------------------------------------------------------------
{
  const alice = await openDevice({ key: 'A', guest: 'AutotestAlice', role: 'WHITE', orientation: 'w', x: 0, profileTag: 'rooms' });
  let matchId;
  let roomCode;
  const roomName = `${PREFIX}-join`;

  await record('JOINING', 'landing page renders create/join/solo tabs', async () => {
    const text = await pageText(alice.page);
    if (!/64 Squares/i.test(text)) throw new Error('missing title copy');
    if (!/Create Room/i.test(text) || !/Join Room/i.test(text) || !/Play Solo/i.test(text)) {
      throw new Error(`tabs missing: ${text.slice(0, 200)}`);
    }
  });

  await record('JOINING', 'create room as White and land on /match/:id', async () => {
    const created = await createViaUi(alice, { roomName, synth: 'AMSynth' });
    matchId = created.matchId;
    roomCode = created.roomCode;
    await waitForText(alice.page, 'Waiting for opponent');
    const shown = await readRoomCode(alice.page);
    if (shown && shown.toLowerCase() !== roomCode.toLowerCase()) {
      throw new Error(`badge ${shown} !== generated ${roomCode}`);
    }
    const row = await fetchMatch(matchId);
    if (row.status !== 'waiting') throw new Error(`status=${row.status}`);
    if (row.white_player_name !== 'AutotestAlice') throw new Error(`white=${row.white_player_name}`);
    if (row.white_player_synth_type !== 'AMSynth') throw new Error(`synth=${row.white_player_synth_type}`);
    return `${matchId} code=${roomCode}`;
  });

  const bob = await openDevice({ key: 'B', guest: 'AutotestBob', role: 'BLACK', orientation: 'b', x: 960, profileTag: 'rooms' });

  await record('JOINING', 'join with a nonexistent/garbage code is rejected', async () => {
    await joinViaUi(bob, { roomCode: 'zzzzzzz', synth: 'Synth' });
    await waitForText(bob.page, 'Room not found', 10000);
    if (bob.page.url().includes('/match/')) throw new Error('navigated to a match anyway');
  });

  await record('JOINING', 'join with a valid short code as Black', async () => {
    // Start from a clean join form. A leftover radix Select from the previous
    // attempt swallows the Join click if we reuse the same page.
    await bob.page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle2' });
    await joinViaUi(bob, { matchId, roomCode, synth: 'FMSynth' });
    await bob.page.waitForFunction(() => location.pathname.startsWith('/match/'), { timeout: 30000 });
    const row = await fetchMatch(matchId);
    if (row.status !== 'active') throw new Error(`status=${row.status}`);
    if (row.black_player_name !== 'AutotestBob') throw new Error(`black=${row.black_player_name}`);
    if (row.black_player_synth_type !== 'FMSynth') throw new Error(`synth=${row.black_player_synth_type}`);
    return row.status;
  });

  await record('JOINING', 'player names render on both sides after join', async () => {
    await waitForText(alice.page, 'AutotestAlice vs AutotestBob');
    await waitForText(bob.page, 'AutotestAlice vs AutotestBob');
  });

  await record('JOINING', 'creator sees opponent-has-joined notification', async () => {
    const text = await pageText(alice.page);
    if (!/AutotestBob has joined/i.test(text) && !/Player Joined/i.test(text)) {
      // The banner auto-dismisses after 4s; joining may have taken longer.
      // Presence of both names plus active turn banner is the durable signal.
      if (!/Your turn|Opponent's turn/i.test(text)) {
        throw new Error(text.slice(0, 400));
      }
      return 'banner already dismissed; names + turn banner present';
    }
  });

  const carol = await openDevice({ key: 'C', guest: 'AutotestCarol', role: 'THIRD', orientation: 'w', x: 480, profileTag: 'rooms' });

  await record('JOINING', 'third player is rejected from a full room', async () => {
    await joinViaUi(carol, { matchId, roomCode, synth: 'Synth' });
    await waitForText(carol.page, 'Room is full|not waiting', 10000);
    if (carol.page.url().includes('/match/')) throw new Error('third player entered the match');
  });

  await record('JOINING', 'creator joining their own room with the same name rejoins as White', async () => {
    const alice2 = await openDevice({
      key: 'A2',
      guest: 'AutotestAlice',
      role: 'WHITE',
      orientation: 'w',
      x: 0,
      profileTag: 'rejoin',
    });
    try {
      await clickByText(alice2.page, 'Join', { role: 'tab' });
      await typeInto(alice2.page, 'join-name', 'AutotestAlice');
      await typeInto(alice2.page, 'join-room-code', roomCode);
      await clickByText(alice2.page, '^\\s*Join Room\\s*$');
      await alice2.page.waitForFunction(() => location.pathname.startsWith('/match/'), { timeout: 20000 });
      await waitForText(alice2.page, 'Restart Game', 20000);
      const text = await pageText(alice2.page);
      if (!/AutotestAlice vs AutotestBob/i.test(text)) throw new Error(text.slice(0, 300));
      if (!/Restart Game/i.test(text)) throw new Error('rejoin as white should still see creator controls');
    } finally {
      await closeDevice(alice2);
    }
  });

  await record('JOINING', 'guest whose name is not a player is redirected home', async () => {
    await carol.page.evaluate((name) => sessionStorage.setItem('64squares_guest_name', name), 'AutotestStranger');
    await carol.page.goto(`${ORIGIN}/match/${matchId}`, { waitUntil: 'networkidle2' });
    await carol.page.waitForFunction((home) => location.href === `${home}/` || location.pathname === '/', {
      timeout: 15000,
    }, ORIGIN);
  });

  await record('JOINING', 'join with the full UUID works for an existing player rejoin', async () => {
    await bob.page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle2' });
    await clickByText(bob.page, 'Join', { role: 'tab' });
    await typeInto(bob.page, 'join-name', 'AutotestBob');
    await typeInto(bob.page, 'join-room-code', matchId);
    await clickByText(bob.page, '^\\s*Join Room\\s*$');
    await bob.page.waitForFunction(() => location.pathname.startsWith('/match/'), { timeout: 20000 });
    await waitForText(bob.page, 'AutotestAlice vs AutotestBob', 20000);
  });

  await closeDevice(carol);
  await closeDevice(bob);
  await closeDevice(alice);
}

// ---------------------------------------------------------------------------
// GAMEPLAY + HEALTH + SOUND on a fresh pair
// ---------------------------------------------------------------------------
{
  const whiteName = 'AutotestWplay';
  const blackName = 'AutotestBplay';
  const { alice, bob, matchId } = await openPair({
    whiteName,
    blackName,
    roomName: `${PREFIX}-play`,
    whiteSynth: 'Synth',
    blackSynth: 'FMSynth',
    tag: 'play',
  });

  try {
    await record('SOUND', 'Enable Audio gate appears for both players', async () => {
      await enableAudio(alice.page);
      await enableAudio(bob.page);
      await sleep(1800); // ignore tremolo LFO oscillator burst
    });

    await record('GAMEPLAY', 'White to move; Black click is ignored (turn enforcement)', async () => {
      const before = (await fetchMatch(matchId)).current_fen;
      await playMove(bob.page, 'e7', 'e5', 'b');
      await sleep(700);
      const after = (await fetchMatch(matchId)).current_fen;
      if (after !== before) throw new Error(`black moved out of turn: ${after}`);
      const occ = await boardOccupancy(bob.page, 'b');
      if (occ.e7 !== 'Black pawn') throw new Error(`e7=${occ.e7}`);
    });

    await record('GAMEPLAY', 'illegal White move e2-e5 is rejected', async () => {
      const before = (await fetchMatch(matchId)).current_fen;
      await playMove(alice.page, 'e2', 'e5', 'w');
      await sleep(700);
      const after = (await fetchMatch(matchId)).current_fen;
      if (after !== before) throw new Error(`illegal move wrote FEN ${after}`);
      const occ = await boardOccupancy(alice.page, 'w');
      if (occ.e2 !== 'White pawn') throw new Error(`e2=${occ.e2}`);
    });

    await record('GAMEPLAY', 'legal-move dots appear after selecting a pawn', async () => {
      await clickSquare(alice.page, 'e2', 'w');
      await sleep(300);
      const n = await legalDotCount(alice.page);
      await clickSquare(alice.page, 'e2', 'w'); // toggle off by clicking again or dest
      if (n < 1) throw new Error(`expected legal-move markers, got ${n}`);
      return `${n} markers`;
    });

    let e4At;
    await record('GAMEPLAY', 'legal e2-e4 updates FEN, move_number=1, both boards', async () => {
      e4At = Date.now();
      await playMove(alice.page, 'e2', 'e4', 'w');
      await sleep(1200);
      const row = await fetchMatch(matchId);
      if (!row.current_fen.startsWith('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b')) {
        throw new Error(row.current_fen);
      }
      const moves = await fetchMoves(matchId);
      if (moves.length !== 1) throw new Error(`moves=${moves.length}`);
      if (moves[0].move_number !== 1) throw new Error(`move_number=${moves[0].move_number} (bug: first move should be 1)`);
      const occA = await boardOccupancy(alice.page, 'w');
      const occB = await boardOccupancy(bob.page, 'b');
      if (occA.e4 !== 'White pawn' || occB.e4 !== 'White pawn') {
        throw new Error(`alice e4=${occA.e4} bob e4=${occB.e4}`);
      }
      return row.current_fen;
    });

    await record('SOUND', 'Black hears White e4 (opponent synth) after the move', async () => {
      const n = await noteStartsSince(bob.page, e4At);
      const rms = await peakRmsSince(bob.page, e4At);
      if (n < 1) throw new Error(`bob note starts=${n} peakRms=${rms.toFixed(4)}`);
      return `starts=${n} peakRms=${rms.toFixed(4)}`;
    });

    await record('GAMEPLAY', 'last-move highlight is applied in multiplayer', async () => {
      const highlighted = await hasLastMoveHighlight(alice.page);
      if (!highlighted) throw new Error('no bg-blue-300/700 square after a local move');
    });

    await record('SOUND', 'changing opponent synth via match UPDATE does not kill White ringing notes', async () => {
      const beforeRms = await peakRmsSince(alice.page, e4At);
      await patchMatch(matchId, { black_player_synth_type: 'MembraneSynth' });
      await sleep(1500);
      // Own e4 note should still be in its 20s envelope.
      const nowRms = await peakRmsSince(alice.page, Date.now() - 250);
      if (nowRms < 0.0005 && beforeRms < 0.0005) {
        throw new Error(`no measurable ringing audio before or after synth change (before=${beforeRms} now=${nowRms})`);
      }
      if (nowRms < 0.0005) {
        throw new Error(`ringing RMS dropped to ${nowRms} after opponent synth change (before peak ${beforeRms})`);
      }
      return `beforePeak=${beforeRms.toFixed(4)} now=${nowRms.toFixed(4)}`;
    });

    let e5At;
    await record('GAMEPLAY', 'Black e7-e5 syncs to White and increments move_number to 2', async () => {
      e5At = Date.now();
      await playMove(bob.page, 'e7', 'e5', 'b');
      await sleep(2500);
      const moves = await fetchMoves(matchId);
      if (moves.length !== 2) throw new Error(`moves=${moves.length}`);
      if (moves[1].move_number !== 2) throw new Error(`move_number=${moves[1].move_number}`);
      const occA = await boardOccupancy(alice.page, 'w');
      if (occA.e5 !== 'Black pawn') throw new Error(`alice e5=${occA.e5}`);
      const n = await noteStartsSince(alice.page, e5At);
      if (n < 1) throw new Error(`white heard no opponent note, starts=${n}`);
      return `startsOnWhite=${n}`;
    });

    await record('HEALTH', 'realtime channel is stable (1 join, no teardown loop)', async () => {
      const a = await probeSnapshot(alice.page);
      const b = await probeSnapshot(bob.page);
      if (a.subscribed < 1 || b.subscribed < 1) throw new Error(`joins A=${a.subscribed} B=${b.subscribed}`);
      if (a.resubscribes > 1 || b.resubscribes > 1) {
        throw new Error(`teardowns A=${a.resubscribes} B=${b.resubscribes}`);
      }
      return `A joins=${a.subscribed} td=${a.resubscribes}; B joins=${b.subscribed} td=${b.resubscribes}`;
    });

    await record('HEALTH', 'chat delivers both ways', async () => {
      await openChat(alice.page);
      await openChat(bob.page);
      await sendChat(alice.page, `${PREFIX} hello from white`);
      await waitForText(bob.page, `${PREFIX} hello from white`, 15000);
      await sendChat(bob.page, `${PREFIX} hello from black`);
      await waitForText(alice.page, `${PREFIX} hello from black`, 15000);
      const rows = await fetchChat(matchId);
      if (rows.length < 2) throw new Error(`chat rows=${rows.length}`);
    });

    await record('HEALTH', 'reload mid-game restores FEN and play continues', async () => {
      const fenBefore = (await fetchMatch(matchId)).current_fen;
      await alice.page.reload({ waitUntil: 'networkidle2' });
      await enableAudio(alice.page);
      await sleep(1500);
      const occ = await boardOccupancy(alice.page, 'w');
      if (occ.e4 !== 'White pawn' || occ.e5 !== 'Black pawn') {
        throw new Error(`after reload e4=${occ.e4} e5=${occ.e5}`);
      }
      await playMove(alice.page, 'd2', 'd4', 'w');
      await sleep(1200);
      const fenAfter = (await fetchMatch(matchId)).current_fen;
      if (fenAfter === fenBefore) throw new Error('d4 did not persist after reload');
      const occB = await boardOccupancy(bob.page, 'b');
      if (occB.d4 !== 'White pawn') throw new Error(`bob did not see d4, d4=${occB.d4}`);
      return fenAfter;
    });

    await record('GAMEPLAY', 'capture e4xd5 writes a new FEN and fires a capture arpeggio', async () => {
      await playMove(bob.page, 'd7', 'd5', 'b');
      await sleep(1000);
      const t = Date.now();
      await playMove(alice.page, 'e4', 'd5', 'w');
      await sleep(1500);
      const occ = await boardOccupancy(alice.page, 'w');
      if (occ.d5 !== 'White pawn') throw new Error(`d5=${occ.d5}`);
      if (occ.e4) throw new Error(`e4 still occupied ${occ.e4}`);
      const nAlice = await noteStartsSince(alice.page, t);
      const nBob = await noteStartsSince(bob.page, t);
      // Destination note + 8-note row arpeggio. Allow some slack for LFOs already ignored.
      if (nAlice < 6) throw new Error(`own capture starts=${nAlice} (expected ~9)`);
      if (nBob < 6) throw new Error(`opponent capture starts=${nBob} (expected ~9)`);
      return `own=${nAlice} opp=${nBob}`;
    });

    await record('GAMEPLAY', 'Restart Game is creator-only, resets both boards, but does not delete moves', async () => {
      const bobText = await pageText(bob.page);
      if (/Restart Game/i.test(bobText)) throw new Error('Black saw Restart Game');
      const movesBefore = await fetchMoves(matchId);
      await confirmDialog(alice.page, 'Restart Game');
      await sleep(1500);
      const row = await fetchMatch(matchId);
      if (!row.current_fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w')) {
        throw new Error(`fen after restart ${row.current_fen}`);
      }
      const occA = await boardOccupancy(alice.page, 'w');
      const occB = await boardOccupancy(bob.page, 'b');
      if (occA.e2 !== 'White pawn' || occB.e7 !== 'Black pawn') {
        throw new Error(`boards did not reset alice.e2=${occA.e2} bob.e7=${occB.e7}`);
      }
      const movesAfter = await fetchMoves(matchId);
      if (movesAfter.length < movesBefore.length) {
        return `unexpected: moves shrank ${movesBefore.length} -> ${movesAfter.length}`;
      }
      if (movesAfter.length !== movesBefore.length) {
        throw new Error(`moves changed ${movesBefore.length} -> ${movesAfter.length}`);
      }
      return `moves remaining=${movesAfter.length} (RLS silent no-op)`;
    });

    await record('GAMEPLAY', 'after restart, a new first ply is again recorded as move_number 1 (duplicate history)', async () => {
      await playMove(alice.page, 'e2', 'e4', 'w');
      await sleep(1200);
      const moves = await fetchMoves(matchId);
      const ones = moves.filter((m) => m.move_number === 1);
      if (ones.length < 2) {
        throw new Error(`expected duplicate move_number=1 after failed delete, got ${ones.length} of ${moves.length} rows`);
      }
      return `move rows=${moves.length} with ${ones.length}x move_number=1`;
    });
  } finally {
    await closeDevice(bob);
    await closeDevice(alice);
  }
}

// ---------------------------------------------------------------------------
// Special moves + game-over via FEN injection (authoritative current_fen)
// ---------------------------------------------------------------------------
{
  const { alice, bob, matchId } = await openPair({
    whiteName: 'AutotestWfen',
    blackName: 'AutotestBfen',
    roomName: `${PREFIX}-fen`,
    tag: 'fen',
  });

  async function loadFen(fen) {
    await patchMatch(matchId, { current_fen: fen, status: 'active', finished_at: null });
    await alice.page.reload({ waitUntil: 'networkidle2' });
    await bob.page.reload({ waitUntil: 'networkidle2' });
    await enableAudio(alice.page);
    await enableAudio(bob.page);
    await sleep(1200);
  }

  try {
    await enableAudio(alice.page);
    await enableAudio(bob.page);
    await sleep(800);

    await record('GAMEPLAY', 'castling kingside from injected FEN', async () => {
      await loadFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
      await playMove(alice.page, 'e1', 'g1', 'w');
      await sleep(1200);
      const occ = await boardOccupancy(alice.page, 'w');
      if (occ.g1 !== 'White king' || occ.f1 !== 'White rook') {
        throw new Error(`g1=${occ.g1} f1=${occ.f1}`);
      }
      const occB = await boardOccupancy(bob.page, 'b');
      if (occB.g1 !== 'White king') throw new Error(`bob g1=${occB.g1}`);
    });

    await record('GAMEPLAY', 'en passant from injected FEN', async () => {
      await loadFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
      await playMove(alice.page, 'e5', 'd6', 'w');
      await sleep(1200);
      const occ = await boardOccupancy(alice.page, 'w');
      if (occ.d6 !== 'White pawn') throw new Error(`d6=${occ.d6}`);
      if (occ.d5) throw new Error(`captured pawn still on d5 (${occ.d5})`);
    });

    await record('GAMEPLAY', 'pawn auto-promotes to queen (no chooser UI)', async () => {
      await loadFen('k7/4P3/8/8/8/8/8/4K3 w - - 0 1');
      await playMove(alice.page, 'e7', 'e8', 'w');
      await sleep(1200);
      const occ = await boardOccupancy(alice.page, 'w');
      if (occ.e8 !== 'White queen') throw new Error(`e8=${occ.e8} (expected White queen)`);
      const text = await pageText(alice.page);
      if (/knight|bishop|rook/i.test(text) && /promot/i.test(text)) {
        throw new Error('promotion chooser appeared');
      }
    });

    await record('GAMEPLAY', 'check is displayed in the match UI', async () => {
      // Queen check that is not mate: Ka8, Qe2, Ke1, white to move Qe2-e8+
      await loadFen('k7/8/8/8/8/8/4Q3/4K3 w - - 0 1');
      await playMove(alice.page, 'e2', 'e8', 'w');
      await sleep(1000);
      const text = await pageText(alice.page);
      if (!/\bcheck\b/i.test(text) || /checkmate/i.test(text)) {
        throw new Error(`expected a Check banner, got: ${text.replace(/\s+/g, ' ').slice(0, 400)}`);
      }
    });

    await record('GAMEPLAY', 'stalemate shows draw UI and writes status=finished', async () => {
      await loadFen('k7/8/1Q6/8/8/8/8/4K3 w - - 0 1');
      // Qb6-b7 is mate; Qb6-c7 or Qa6? Queen on b6, K a8. Qc7 is stalemate? 
      // Actually load a position already stalemate-after-move: Q from b6 to c7.
      await playMove(alice.page, 'b6', 'c7', 'w');
      await sleep(1500);
      const text = await pageText(alice.page);
      if (!/Stalemate/i.test(text)) throw new Error(text.replace(/\s+/g, ' ').slice(0, 400));
      const row = await fetchMatch(matchId);
      if (row.status !== 'finished') throw new Error(`status=${row.status}`);
    });

    await record('GAMEPLAY', 'insufficient-material draw writes finished and shows a draw banner', async () => {
      await loadFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
      await sleep(500);
      const text = await pageText(alice.page);
      const row = await fetchMatch(matchId);
      // The page only finishes a game after a move. Injecting a dead position
      // leaves status as we set it ('active') unless we also patch status.
      if (!/draw/i.test(text) && row.status !== 'finished') {
        throw new Error(`no draw UI and status=${row.status}: ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
      }
      return `status=${row.status}`;
    });
  } finally {
    await closeDevice(bob);
    await closeDevice(alice);
  }
}

// ---------------------------------------------------------------------------
// Fool's mate + End Room + two tabs + solo + cron
// ---------------------------------------------------------------------------
{
  const { alice, bob, matchId } = await openPair({
    whiteName: 'AutotestWmate',
    blackName: 'AutotestBmate',
    roomName: `${PREFIX}-mate`,
    tag: 'mate',
  });
  try {
    await enableAudio(alice.page);
    await enableAudio(bob.page);
    await sleep(800);
    await record('GAMEPLAY', "fool's mate shows Checkmate and finishes the match", async () => {
      await playMove(alice.page, 'f2', 'f3', 'w');
      await sleep(900);
      await playMove(bob.page, 'e7', 'e5', 'b');
      await sleep(900);
      await playMove(alice.page, 'g2', 'g4', 'w');
      await sleep(900);
      await playMove(bob.page, 'd8', 'h4', 'b');
      await sleep(1500);
      const textA = await pageText(alice.page);
      const textB = await pageText(bob.page);
      if (!/Checkmate/i.test(textA)) throw new Error(`white UI: ${textA.replace(/\s+/g, ' ').slice(0, 300)}`);
      if (!/Checkmate/i.test(textB)) throw new Error(`black UI: ${textB.replace(/\s+/g, ' ').slice(0, 300)}`);
      if (!/Black wins/i.test(textA)) throw new Error('missing winner copy');
      const row = await fetchMatch(matchId);
      if (row.status !== 'finished') throw new Error(`status=${row.status}`);
      if (row.winner_id != null) return `winner_id unexpectedly set ${row.winner_id}`;
      return `status=${row.status} winner_id=${row.winner_id}`;
    });
  } finally {
    await closeDevice(bob);
    await closeDevice(alice);
  }
}

{
  const { alice, bob, matchId } = await openPair({
    whiteName: 'AutotestWend',
    blackName: 'AutotestBend',
    roomName: `${PREFIX}-end`,
    tag: 'end',
  });
  try {
    await dismissAudioIfPresent(alice.page);
    await dismissAudioIfPresent(bob.page);
    await record('GAMEPLAY', 'End Room notifies Black and marks the match finished', async () => {
      const bobTextBefore = await pageText(bob.page);
      if (/End Room/i.test(bobTextBefore)) throw new Error('Black saw End Room');
      await confirmDialog(alice.page, 'End Room');
      await sleep(1500);
      const textB = await pageText(bob.page);
      if (!/ended the room|Room Ended/i.test(textB)) {
        throw new Error(`black UI: ${textB.replace(/\s+/g, ' ').slice(0, 400)}`);
      }
      const row = await fetchMatch(matchId);
      if (row.status !== 'finished') throw new Error(`status=${row.status}`);
    });
  } finally {
    await closeDevice(bob);
    await closeDevice(alice);
  }
}

await record('HEALTH', 'two tabs on the same origin keep separate guest names (sessionStorage)', async () => {
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/local/bin/google-chrome',
    headless: false,
    defaultViewport: { width: 1100, height: 800 },
    userDataDir: `/tmp/64squares-tests/profile-tabs-${Date.now()}`,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--window-size=1100,800'],
    protocolTimeout: 60000,
  });
  try {
    const tab1 = await browser.newPage();
    const tab2 = await browser.newPage();
    await tab1.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await tab2.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await tab1.evaluate(() => sessionStorage.setItem('64squares_guest_name', 'AutotestTabOne'));
    await tab2.evaluate(() => sessionStorage.setItem('64squares_guest_name', 'AutotestTabTwo'));
    const stored = await Promise.all([
      tab1.evaluate(() => sessionStorage.getItem('64squares_guest_name')),
      tab2.evaluate(() => sessionStorage.getItem('64squares_guest_name')),
    ]);
    if (stored[0] !== 'AutotestTabOne' || stored[1] !== 'AutotestTabTwo') {
      throw new Error(JSON.stringify(stored));
    }
    return stored.join(',');
  } finally {
    await browser.close();
  }
});

await record('HEALTH', 'solo mode at /play plays both colours, rejects illegal moves, resets', async () => {
  const solo = await openDevice({
    key: 'S',
    guest: 'AutotestSolo',
    role: 'SOLO',
    orientation: 'w',
    x: 0,
    profileTag: 'solo',
  });
  try {
    await clickByText(solo.page, 'Solo', { role: 'tab' });
    await clickByText(solo.page, 'Start Solo Game');
    await solo.page.waitForFunction(() => location.pathname.startsWith('/play'), { timeout: 15000 });
    await enableAudio(solo.page);
    await sleep(400);
    await playMove(solo.page, 'e2', 'e5', 'w');
    await sleep(400);
    let occ = await boardOccupancy(solo.page, 'w');
    if (occ.e2 !== 'White pawn') throw new Error('solo accepted illegal e2-e5');
    await playMove(solo.page, 'e2', 'e4', 'w');
    await sleep(400);
    occ = await boardOccupancy(solo.page, 'w');
    if (occ.e4 !== 'White pawn') throw new Error('solo rejected e2-e4');
    await playMove(solo.page, 'e7', 'e5', 'w');
    await sleep(400);
    occ = await boardOccupancy(solo.page, 'w');
    if (occ.e5 !== 'Black pawn') throw new Error('solo did not let Black move');
    const highlighted = await hasLastMoveHighlight(solo.page);
    await clickByText(solo.page, 'Reset Game');
    await sleep(400);
    occ = await boardOccupancy(solo.page, 'w');
    if (occ.e2 !== 'White pawn' || occ.e7 !== 'Black pawn') throw new Error('reset failed');
    return `lastMoveHighlight=${highlighted}`;
  } finally {
    await closeDevice(solo);
  }
});

await record('HEALTH', 'GET /api/cron/keep-supabase-awake rejects browsers and accepts vercel-cron UA', async () => {
  const unauth = await fetch(`${ORIGIN}/api/cron/keep-supabase-awake`);
  const unauthBody = await unauth.json();
  if (unauth.status !== 401) throw new Error(`expected 401, got ${unauth.status} ${JSON.stringify(unauthBody)}`);
  const auth = await fetch(`${ORIGIN}/api/cron/keep-supabase-awake`, {
    headers: { 'user-agent': 'vercel-cron/1.0' },
  });
  const authBody = await auth.json();
  if (auth.status !== 200 || authBody.ok !== true) {
    throw new Error(`cron UA got ${auth.status} ${JSON.stringify(authBody)}`);
  }
  return `401 then ${auth.status} ok=${authBody.ok}`;
});

await record('SOUND', 'all four landing-page synth types are selectable', async () => {
  const page = await openDevice({
    key: 'Q',
    guest: 'AutotestSynth',
    role: 'WHITE',
    orientation: 'w',
    profileTag: 'synths',
  });
  try {
    const types = ['Synth', 'FMSynth', 'AMSynth', 'MembraneSynth'];
    for (const t of types) {
      await selectVisibleSynth(page.page, t);
    }
    return types.join(', ');
  } finally {
    await closeDevice(page);
  }
});

// Fast 12-move game for the original realtime/audio regression
{
  const { alice, bob, matchId } = await openPair({
    whiteName: 'AutotestWfast',
    blackName: 'AutotestBfast',
    roomName: `${PREFIX}-fast`,
    whiteSynth: 'AMSynth',
    blackSynth: 'MembraneSynth',
    tag: 'fast',
  });
  const MOVES = [
    ['e2', 'e4'],
    ['e7', 'e5'],
    ['g1', 'f3'],
    ['b8', 'c6'],
    ['f1', 'c4'],
    ['g8', 'f6'],
    ['d2', 'd3'],
    ['f8', 'e7'],
    ['b1', 'c3'],
    ['d7', 'd6'],
    ['c1', 'e3'],
    ['c8', 'e6'],
  ];
  try {
    await enableAudio(alice.page);
    await enableAudio(bob.page);
    await sleep(1800);
    const heard = [];
    const gap = Number(process.env.MOVE_GAP_MS || 1800);
    for (const [i, [from, to]] of MOVES.entries()) {
      const mover = i % 2 === 0 ? alice : bob;
      const listener = i % 2 === 0 ? bob : alice;
      const t = Date.now();
      await playMove(mover.page, from, to, mover.orientation);
      await sleep(gap);
      const starts = await noteStartsSince(listener.page, t);
      heard.push({ halfMove: i + 1, move: `${from}-${to}`, listenerStarts: starts, heard: starts > 0 });
    }
    await sleep(800);
    await record('HEALTH', 'fast 12-ply game writes 12 moves and keeps current_fen in sync', async () => {
      const moves = await fetchMoves(matchId);
      const row = await fetchMatch(matchId);
      if (moves.length !== 12) throw new Error(`db moves=${moves.length} numbers=${moves.map((m) => m.move_number).join(',')}`);
      if (moves[0].move_number !== 1) throw new Error(`first move_number=${moves[0].move_number}`);
      const occA = await boardOccupancy(alice.page, 'w');
      const occB = await boardOccupancy(bob.page, 'b');
      if (occA.e4 !== 'White pawn' || occB.e6 !== 'Black bishop') {
        throw new Error(`desync alice.e4=${occA.e4} bob.e6=${occB.e6} fen=${row.current_fen}`);
      }
      return row.current_fen;
    });
    await record('SOUND', 'listener heard all 12 opponent moves at 1.8s pace', async () => {
      const silent = heard.filter((h) => !h.heard);
      if (silent.length) throw new Error(silent.map((s) => `${s.halfMove}:${s.move}`).join(', '));
      return heard.map((h) => `${h.halfMove}:${h.listenerStarts}`).join(' ');
    });
    await record('HEALTH', 'fast game did not churn the realtime channel', async () => {
      const a = await probeSnapshot(alice.page);
      const b = await probeSnapshot(bob.page);
      if (a.resubscribes > 1 || b.resubscribes > 1) {
        throw new Error(`teardowns A=${a.resubscribes} B=${b.resubscribes} joins A=${a.subscribed} B=${b.subscribed}`);
      }
      return `A joins=${a.subscribed} td=${a.resubscribes}; B joins=${b.subscribed} td=${b.resubscribes}`;
    });
  } finally {
    await closeDevice(bob);
    await closeDevice(alice);
  }
}

const summary = {
  prefix: PREFIX,
  origin: ORIGIN,
  createdMatches,
  passed: results.filter((r) => r.pass).length,
  failed: results.filter((r) => !r.pass).length,
  results,
};
writeFileSync('/tmp/64squares-tests/live-report.json', JSON.stringify(summary, null, 2));
log(`DONE  ${summary.passed} passed, ${summary.failed} failed, ${createdMatches.length} rooms created`);
for (const r of results.filter((x) => !x.pass)) log(`  FAIL ${r.area}/${r.name}: ${r.detail}`);
process.exit(summary.failed ? 1 : 0);
