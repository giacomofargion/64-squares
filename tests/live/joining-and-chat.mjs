/**
 * Focused re-run of join/chat/tab cases that the main sweep either sequenced
 * badly (same form after an error + open radix select) or ran at a 960px width
 * where chat is collapsed.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import {
  ORIGIN,
  sleep,
  clickByText,
  typeInto,
  playMove,
  enableAudio,
  pageText,
  waitForText,
  openDevice,
  closeDevice,
} from './helpers.mjs';

mkdirSync('/tmp/64squares-tests', { recursive: true });
const envText = readFileSync('/workspace/.env.local', 'utf8');
const env = Object.fromEntries(envText.split('\n').filter((l) => l.includes('=')).map((l) => {
  const i = l.indexOf('=');
  return [l.slice(0, i), l.slice(i + 1)];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const PREFIX = `autotest-${Date.now()}-rejoin`;
const created = [];
const results = [];
const log = (m) => console.log(m);

function generateRoomCode(uuid) {
  return uuid.replace(/-/g, '').slice(-7);
}

async function record(name, fn) {
  try {
    const detail = (await fn()) || '';
    results.push({ name, pass: true, detail: String(detail) });
    log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    results.push({ name, pass: false, detail: err instanceof Error ? err.message : String(err) });
    log(`FAIL  ${name} — ${err instanceof Error ? err.message : err}`);
  }
}

async function openChat(page) {
  const opened = await page.evaluate(() => {
    const input = document.querySelector('input[placeholder="Type a message..."]');
    if (input && input.offsetParent !== null) return 'already';
    const tap = [...document.querySelectorAll('p,button,div')].find((el) =>
      /Tap to open chat/i.test(el.textContent || '')
    );
    if (tap) {
      tap.click();
      return 'tapped';
    }
    const toggle = document.querySelector('button[aria-label="Open chat"]');
    if (toggle) {
      toggle.click();
      return 'aria';
    }
    return 'missing';
  });
  await sleep(400);
  return opened;
}

const alice = await openDevice({
  key: 'A',
  guest: 'AutotestReAlice',
  role: 'WHITE',
  orientation: 'w',
  x: 0,
  profileTag: 'rejoin',
});
await typeInto(alice.page, 'create-name', 'AutotestReAlice');
await typeInto(alice.page, 'create-room-name', `${PREFIX}-main`);
await clickByText(alice.page, '^\\s*Create Room\\s*$');
await alice.page.waitForFunction(() => location.pathname.startsWith('/match/'), { timeout: 30000 });
const matchId = alice.page.url().split('/match/')[1];
const roomCode = generateRoomCode(matchId);
created.push({ id: matchId, room_name: `${PREFIX}-main`, room_code: roomCode });
log(`created ${matchId} code=${roomCode}`);

await record('short-code join from a fresh browser (no leftover dialog)', async () => {
  const bob = await openDevice({
    key: 'B',
    guest: 'AutotestReBob',
    role: 'BLACK',
    orientation: 'b',
    x: 960,
    profileTag: 'rejoin',
  });
  try {
    await clickByText(bob.page, 'Join', { role: 'tab' });
    await typeInto(bob.page, 'join-name', 'AutotestReBob');
    await typeInto(bob.page, 'join-room-code', roomCode);
    await clickByText(bob.page, '^\\s*Join Room\\s*$');
    await bob.page.waitForFunction(() => location.pathname.startsWith('/match/'), { timeout: 20000 });
    const row = await supabase.from('matches').select('*').eq('id', matchId).single();
    if (row.data.black_player_name !== 'AutotestReBob') throw new Error(JSON.stringify(row.data));
    await waitForText(alice.page, 'AutotestReAlice vs AutotestReBob', 15000);
    await waitForText(bob.page, 'AutotestReAlice vs AutotestReBob', 15000);
    const aliceText = await pageText(alice.page);
    const joinedBanner = /AutotestReBob has joined|Player Joined/i.test(aliceText);
    return `status=${row.data.status} banner=${joinedBanner}`;
  } finally {
    // leave bob open for later tests
    globalThis.__bob = bob;
  }
});

const bob = globalThis.__bob;
await enableAudio(alice.page).catch(() => {});
await enableAudio(bob.page).catch(() => {});
await sleep(500);

await record('opponent-joined banner was visible to the waiting creator (or names already show)', async () => {
  const text = await pageText(alice.page);
  if (/AutotestReBob has joined|Player Joined/i.test(text)) return 'banner still visible';
  if (/AutotestReAlice vs AutotestReBob/i.test(text)) return 'banner gone, names present';
  throw new Error(text.replace(/\s+/g, ' ').slice(0, 400));
});

await record('third player is rejected once the room is active', async () => {
  const carol = await openDevice({
    key: 'C',
    guest: 'AutotestReCarol',
    role: 'THIRD',
    orientation: 'w',
    x: 480,
    profileTag: 'rejoin-c',
  });
  try {
    await clickByText(carol.page, 'Join', { role: 'tab' });
    await typeInto(carol.page, 'join-name', 'AutotestReCarol');
    await typeInto(carol.page, 'join-room-code', roomCode);
    await clickByText(carol.page, '^\\s*Join Room\\s*$');
    await waitForText(carol.page, 'Room is full|not waiting for players', 12000);
    if (carol.page.url().includes('/match/')) throw new Error('third player entered /match/');
  } finally {
    await closeDevice(carol);
  }
});

await record('creator rejoins own room with the same name as White', async () => {
  const alice2 = await openDevice({
    key: 'A2',
    guest: 'AutotestReAlice',
    role: 'WHITE',
    orientation: 'w',
    x: 0,
    profileTag: 'rejoin-a2',
  });
  try {
    await clickByText(alice2.page, 'Join', { role: 'tab' });
    await typeInto(alice2.page, 'join-name', 'AutotestReAlice');
    await typeInto(alice2.page, 'join-room-code', roomCode);
    await clickByText(alice2.page, '^\\s*Join Room\\s*$');
    await alice2.page.waitForFunction(() => location.pathname.startsWith('/match/'), { timeout: 20000 });
    await waitForText(alice2.page, 'AutotestReAlice vs AutotestReBob|Restart Game', 20000);
    const text = await pageText(alice2.page);
    if (!/Restart Game/i.test(text)) throw new Error(`no creator controls: ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
  } finally {
    await closeDevice(alice2);
  }
});

await record('existing Black player rejoins with the full UUID', async () => {
  const bob2 = await openDevice({
    key: 'B2',
    guest: 'AutotestReBob',
    role: 'BLACK',
    orientation: 'b',
    x: 960,
    profileTag: 'rejoin-b2',
  });
  try {
    await clickByText(bob2.page, 'Join', { role: 'tab' });
    await typeInto(bob2.page, 'join-name', 'AutotestReBob');
    await typeInto(bob2.page, 'join-room-code', matchId);
    await clickByText(bob2.page, '^\\s*Join Room\\s*$');
    await bob2.page.waitForFunction(() => location.pathname.startsWith('/match/'), { timeout: 20000 });
    await waitForText(bob2.page, 'AutotestReAlice vs AutotestReBob', 20000);
  } finally {
    await closeDevice(bob2);
  }
});

await record('chat delivers both ways after opening the mobile drawer', async () => {
  const howA = await openChat(alice.page);
  const howB = await openChat(bob.page);
  await alice.page.waitForSelector('input[placeholder="Type a message..."]', { timeout: 8000 });
  await alice.page.type('input[placeholder="Type a message..."]', `${PREFIX} from white`, { delay: 15 });
  await clickByText(alice.page, '^\\s*Send\\s*$');
  await waitForText(bob.page, `${PREFIX} from white`, 15000);
  await bob.page.waitForSelector('input[placeholder="Type a message..."]', { timeout: 8000 });
  await bob.page.type('input[placeholder="Type a message..."]', `${PREFIX} from black`, { delay: 15 });
  await clickByText(bob.page, '^\\s*Send\\s*$');
  await waitForText(alice.page, `${PREFIX} from black`, 15000);
  return `openA=${howA} openB=${howB}`;
});

await record('Black e7-e5 is recorded as move_number 2', async () => {
  await playMove(alice.page, 'e2', 'e4', 'w');
  await sleep(1500);
  await playMove(bob.page, 'e7', 'e5', 'b');
  await sleep(2000);
  const { data: moves } = await supabase
    .from('moves')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });
  if (!moves?.some((m) => m.move_from === 'e7' && m.move_to === 'e5' && m.move_number === 2)) {
    throw new Error(JSON.stringify(moves));
  }
  const { data: row } = await supabase.from('matches').select('current_fen').eq('id', matchId).single();
  if (!row.current_fen.includes('4p3') && !row.current_fen.includes('4p3'.toUpperCase())) {
    // black pawn on e5 is .../4p3/ in fen rank 5
  }
  if (!/4p3/.test(row.current_fen.split(' ')[0].split('/')[3])) {
    throw new Error(`fen=${row.current_fen}`);
  }
  return row.current_fen;
});

await closeDevice(bob);
await closeDevice(alice);

await record('two tabs in one profile have independent sessionStorage', async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/local/bin/google-chrome',
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
    await tab1.reload({ waitUntil: 'domcontentloaded' });
    await tab2.reload({ waitUntil: 'domcontentloaded' });
    const afterReload = await Promise.all([
      tab1.evaluate(() => sessionStorage.getItem('64squares_guest_name')),
      tab2.evaluate(() => sessionStorage.getItem('64squares_guest_name')),
    ]);
    if (afterReload[0] !== 'AutotestTabOne' || afterReload[1] !== 'AutotestTabTwo') {
      throw new Error(`after reload ${JSON.stringify(afterReload)}`);
    }
    const typed = await Promise.all([
      tab1.$eval('#create-name', (el) => el.value),
      tab2.evaluate(() => {
        const join = document.querySelector('#join-name');
        const create = document.querySelector('#create-name');
        return (join && join.offsetParent ? join.value : create?.value) || '';
      }),
    ]);
    return `storage=${stored.join(',')} inputs=${typed.join(',')}`;
  } finally {
    await browser.close();
  }
});

const summary = { prefix: PREFIX, created, results, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length };
writeFileSync('/tmp/64squares-tests/rejoin-report.json', JSON.stringify(summary, null, 2));
log(`DONE ${summary.passed} passed, ${summary.failed} failed`);
process.exit(summary.failed ? 1 : 0);
