/**
 * Drives the real production build (`next build` + `next start`) against the
 * in-process fake Supabase, through the actual landing page: create a room,
 * join it from a second browser, enable audio on both, play a game, and
 * listen to what each browser really sends to its speakers.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4124 NEXT_PUBLIC_SUPABASE_ANON_KEY=x npx next build
 *   npx next start -p 3200 &
 *   DISPLAY=:1 ORIGIN=http://127.0.0.1:3200 node tests/realtime/prod-driver.mjs
 */
import { createFakeSupabase } from './server.mjs';
import {
  ORIGIN,
  sleep,
  realClick,
  clickByText,
  typeInto,
  selectVisibleSynth,
  playMove,
  enableAudio,
  waitForText,
  peakRmsSince,
  noteStartsSince,
  openDevice,
  closeDevice,
} from '../live/helpers.mjs';

const PORT = Number(process.env.PORT ?? 4124);
// LIVE=1 skips the fake and plays against whatever ORIGIN points at (the
// deployed site talks to the real Supabase through its public anon key).
const live = process.env.LIVE === '1';
const whiteSynth = process.env.WHITE_SYNTH || 'AMSynth';
const blackSynth = process.env.BLACK_SYNTH || 'FMSynth';
const AUDIBLE_RMS = 0.01;
const STILL_RINGING_RMS = 0.004;
const RING_CHECK_MS = 3_000;

const MOVES = [
  ['e2', 'e4'],
  ['e7', 'e5'],
  ['g1', 'f3'],
  ['b8', 'c6'],
  ['f1', 'c4'],
  ['g8', 'f6'],
  ['d2', 'd3'],
  ['f8', 'c5'],
];

const startedAt = Date.now();
const failures = [];
const log = (who, message) => console.log(`${String(Date.now() - startedAt).padStart(6)}ms [${who}] ${message}`);
const fail = (message) => {
  failures.push(message);
  log('server', `FAIL ${message}`);
};

let snapshotTaken = false;
async function snapshotOnFirstFailure(devices) {
  if (snapshotTaken) return;
  snapshotTaken = true;
  for (const device of devices) {
    if (!device) continue;
    const file = `/tmp/64squares-tests/shots/prod-${device.key}.png`;
    await device.page.screenshot({ path: file, fullPage: true }).catch(() => {});
    const text = await device.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600)).catch(() => '');
    log(device.label, `screenshot ${file}; text: ${text}`);
  }
}

const LABELS = { A: 'A(white/creator)', B: 'B(black/joiner)' };

function watchConsole(device) {
  device.page.on('console', (msg) => {
    const text = msg.text();
    if (/Tone\.js|React DevTools|Failed to load resource|Render - Game state|Match updated|Board detected FEN/.test(text)) return;
    log(device.label, `console.${msg.type()}: ${text.slice(0, 220)}`);
  });
  device.page.on('pageerror', (err) => fail(`${device.label} page error: ${err.message}`));
}

// Click the Enable button inside the prompt when it is open. A click aimed at
// the header button lands on the dialog overlay instead and just dismisses it.
async function enableAudioLikeAPlayer(device) {
  await device.page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => /enable audio/i.test(b.textContent || '')),
    { timeout: 25_000, polling: 50 }
  );
  await sleep(900);
  const dialogButton = await device.page.evaluateHandle(
    () =>
      [...document.querySelectorAll('[role="alertdialog"] button, [role="dialog"] button')].find((b) =>
        /enable audio/i.test(b.textContent || '')
      ) || null
  );
  if (dialogButton.asElement()) {
    await realClick(device.page, dialogButton.asElement());
    log(device.label, 'clicked Enable Audio in the prompt');
  } else {
    await enableAudio(device.page);
    log(device.label, 'clicked Enable audio in the header');
  }
  await device.page.evaluate(() => window.__markAudioStarted?.());
}

async function waitForNoteOnset(device, sinceTs, timeoutMs = 3_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if ((await noteStartsSince(device.page, sinceTs)) > 0) return true;
    await sleep(50);
  }
  return false;
}

async function waitForAudibleOutput(device, sinceTs, timeoutMs = 3_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if ((await peakRmsSince(device.page, sinceTs)) > AUDIBLE_RMS) return true;
    await sleep(50);
  }
  return false;
}

async function checkStillRinging(device, moveStartedAt, description) {
  const remaining = moveStartedAt + RING_CHECK_MS - Date.now();
  if (remaining > 0) await sleep(remaining);
  const level = await peakRmsSince(device.page, Date.now() - 400);
  if (level < STILL_RINGING_RMS) {
    fail(`${device.label} went silent ${RING_CHECK_MS}ms after ${description} (rms=${level.toFixed(4)})`);
  } else {
    log('server', `PASS ${device.label} still ringing after ${description} (rms=${level.toFixed(3)})`);
  }
}

async function contextState(device) {
  return device.page.evaluate(() => {
    const ctx = window.__probe?.contexts?.[0];
    return ctx ? ctx.state : 'no-context-seen';
  });
}

// The landing page pre-fills the name from the guest session on the way back,
// so replace whatever is there instead of typing after it.
async function replaceValue(page, id, value) {
  await page.waitForSelector(`#${id}`, { timeout: 20_000 });
  await page.click(`#${id}`);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type(`#${id}`, value, { delay: 15 });
}

// Tone's master output is global and survives client-side navigation. A mute
// pressed in one room must not follow the player into the next one.
async function rematchAfterMute() {
  log('server', '########## REMATCH: mute, leave, create a new room, play ##########');
  await realClick(alice.page, 'button[aria-label="Mute"]');
  await sleep(200);
  await clickByText(alice.page, 'Back to Home');
  await clickByText(bob.page, 'Back to Home');
  await alice.page.waitForFunction(() => location.pathname === '/', { timeout: 15_000, polling: 50 });
  await bob.page.waitForFunction(() => location.pathname === '/', { timeout: 15_000, polling: 50 });

  await replaceValue(alice.page, 'create-name', whiteName);
  await replaceValue(alice.page, 'create-room-name', `${runTag} rematch`);
  await clickByText(alice.page, '^\\s*Create Room\\s*$');
  await alice.page.waitForFunction(() => location.pathname.startsWith('/match/'), { timeout: 30_000, polling: 50 });
  await waitForText(alice.page, 'Waiting for opponent');
  await enableAudioLikeAPlayer(alice);

  await clickByText(bob.page, 'Join', { role: 'tab' });
  await bob.page.waitForSelector('#join-name', { timeout: 20_000 });
  await replaceValue(bob.page, 'join-name', blackName);
  await replaceValue(bob.page, 'join-room-code', fake.matchId);
  await clickByText(bob.page, '^\\s*Join Room\\s*$');
  await bob.page.waitForFunction(() => location.pathname.startsWith('/match/'), { timeout: 30_000, polling: 50 });
  await waitForText(alice.page, `${whiteName} vs ${blackName}`);
  await enableAudioLikeAPlayer(bob);
  await sleep(1_000);

  const moveStartedAt = Date.now();
  await playMove(alice.page, 'e2', 'e4', 'w');
  const onset = await waitForNoteOnset(alice, moveStartedAt);
  const audible = await waitForAudibleOutput(alice, moveStartedAt);
  if (onset && audible) {
    log('server', 'PASS rematch after mute: creator is audible in the new room');
  } else {
    fail(`rematch after mute: creator silent in the new room (onset=${onset} audible=${audible})`);
  }
}

const fake = live
  ? null
  : createFakeSupabase({
      port: PORT,
      bundles: {},
      apikeyToDevice: { 'label-a': LABELS.A, 'label-b': LABELS.B },
      log,
    });

const runTag = `autotest-${Date.now()}`;
const whiteName = live ? `${runTag}-white` : 'Alice';
const blackName = live ? `${runTag}-black` : 'Bob';

let alice;
let bob;
try {
  if (fake) await fake.listen();
  log('server', `${live ? 'LIVE' : `fake supabase on ${PORT}`}, app at ${ORIGIN}, synths white=${whiteSynth} black=${blackSynth}`);

  alice = await openDevice({ key: 'A', guest: whiteName, role: 'WHITE', orientation: 'w', x: 0, profileTag: 'prod' });
  alice.label = LABELS.A;
  watchConsole(alice);
  await typeInto(alice.page, 'create-name', whiteName);
  await typeInto(alice.page, 'create-room-name', `${runTag} room`);
  if (whiteSynth !== 'Synth') await selectVisibleSynth(alice.page, whiteSynth);
  await clickByText(alice.page, '^\\s*Create Room\\s*$');
  await alice.page.waitForFunction(() => location.pathname.startsWith('/match/'), { timeout: 30_000, polling: 50 });
  await waitForText(alice.page, 'Waiting for opponent');
  const matchId = alice.page.url().split('/match/')[1];
  log(LABELS.A, `created room, url=${alice.page.url()}`);

  // Hosts usually enable audio before anyone has joined.
  await enableAudioLikeAPlayer(alice);
  log(LABELS.A, `enabled audio, ctx=${await contextState(alice)}`);

  bob = await openDevice({ key: 'B', guest: blackName, role: 'BLACK', orientation: 'b', x: 960, profileTag: 'prod' });
  bob.label = LABELS.B;
  watchConsole(bob);
  await clickByText(bob.page, 'Join', { role: 'tab' });
  await bob.page.waitForSelector('#join-name', { timeout: 20_000 });
  await typeInto(bob.page, 'join-name', blackName);
  await typeInto(bob.page, 'join-room-code', matchId);
  if (blackSynth !== 'Synth') await selectVisibleSynth(bob.page, blackSynth);
  await clickByText(bob.page, '^\\s*Join Room\\s*$');
  await bob.page.waitForFunction(() => location.pathname.startsWith('/match/'), { timeout: 30_000, polling: 50 });
  log(LABELS.B, `joined, url=${bob.page.url()}`);
  await waitForText(alice.page, `${whiteName} vs ${blackName}`);
  await waitForText(bob.page, `${whiteName} vs ${blackName}`);

  await enableAudioLikeAPlayer(bob);
  log(LABELS.B, `enabled audio, ctx=${await contextState(bob)}`);
  await sleep(1_500);

  for (const [index, [from, to]] of MOVES.entries()) {
    const mover = index % 2 === 0 ? alice : bob;
    const listener = index % 2 === 0 ? bob : alice;
    log('server', `########## HALF-MOVE ${index + 1}: ${mover.label} ${from}-${to} ##########`);
    const moveStartedAt = Date.now();
    await playMove(mover.page, from, to, mover.orientation);

    const description = `${mover.label} played ${from}-${to}`;
    for (const [who, role] of [[mover, 'own'], [listener, 'opponent']]) {
      // Earlier notes ring for 20s, so the level alone cannot prove this move
      // sounded. Require a fresh oscillator start as well.
      const onset = await waitForNoteOnset(who, moveStartedAt);
      const audible = await waitForAudibleOutput(who, moveStartedAt);
      if (onset && audible) {
        log('server', `PASS ${who.label} ${role} note ${to}: new voice started and output audible`);
      } else {
        fail(`${who.label} ${role} note ${to}: onset=${onset} audible=${audible} ctx=${await contextState(who)}`);
        await snapshotOnFirstFailure([alice, bob]);
      }
    }
    await checkStillRinging(mover, moveStartedAt, description);
    await checkStillRinging(listener, moveStartedAt, description);
  }

  if (fake) {
    log('server', `db moves: ${fake.db.moves.map((m) => `${m.move_from}-${m.move_to}#${m.move_number}`).join(' ')}`);
    if (process.env.REMATCH === '1') await rematchAfterMute();
  } else {
    // Leave the real database tidy: the creator ends the test room.
    await clickByText(alice.page, '^\\s*End Room\\s*$');
    await sleep(300);
    await alice.page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')].filter((b) => /^\s*End Room\s*$/i.test(b.textContent || ''));
      buttons.at(-1)?.click();
    });
    await waitForText(bob.page, 'ended the room|Room Ended', 15_000).catch(() => log(LABELS.B, 'no room-ended notice seen'));
    log('server', 'test room ended');
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  await closeDevice(alice);
  await closeDevice(bob);
  if (fake) await fake.close();
}

if (failures.length) {
  console.error(`\n${failures.length} production failure(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('\nproduction harness passed');
