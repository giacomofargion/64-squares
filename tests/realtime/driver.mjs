/**
 * Two headless browsers against an in-process fake Supabase.
 *
 * Default run plays 1. e4 e5 2. Nf3 Nc6 and drops the moves INSERT for
 * half-move 3. Exits non-zero unless each device joined once, both stayed
 * subscribed during the game, the listener heard the dropped move, and the
 * stored move numbers are 1..n.
 */
import puppeteer from 'puppeteer-core';
import esbuild from 'esbuild';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeSupabase } from './server.mjs';

const realtimeDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(realtimeDir, '../..');
const PORT = Number(process.env.PORT ?? 4124);
const chromePath = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
// Both players are tabs in one browser, so the background tab's animation
// frames are throttled. waitForFunction polls on frames by default and can
// stall there even after the DOM already has what we're waiting for.
const POLL_MS = 50;

const DEVICES = {
  A: { key: 'apikey-device-a', guest: 'Alice', orientation: 'w', label: 'A(white/creator)' },
  B: { key: 'apikey-device-b', guest: 'Bob', orientation: 'b', label: 'B(black/joiner)' },
};

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

// Headless Chrome hands the analyser silence, so listening to the actual
// output needs a visible window (DISPLAY must point at an X server).
const measureOutput = process.env.MEASURE_OUTPUT === '1';
const AUDIBLE_RMS = 0.01;
const STILL_RINGING_RMS = 0.004;
const RING_CHECK_MS = 3_000;

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number, got ${JSON.stringify(raw)}`);
  }
  return value;
}

const latencyMs = envNumber('LATENCY_MS', 100);
const minIntervalMs = envNumber('MIN_INTERVAL_MS', 400);
const maxIntervalMs = envNumber('MAX_INTERVAL_MS', 4000);
const activationMs = envNumber('ACTIVATION_MS', 0);
const dropOnHalfMove = envNumber('DROP_INSERT_ON_HALFMOVE', 3);

if (minIntervalMs > maxIntervalMs) {
  throw new Error('MIN_INTERVAL_MS must be less than or equal to MAX_INTERVAL_MS');
}
if (!Number.isInteger(dropOnHalfMove) || dropOnHalfMove < 1 || dropOnHalfMove > MOVES.length) {
  throw new Error(`DROP_INSERT_ON_HALFMOVE must be an integer from 1 to ${MOVES.length}`);
}

const startedAt = Date.now();
const timeline = [];
const failures = [];

function log(who, message) {
  const line = `${String(Date.now() - startedAt).padStart(6, ' ')}ms [${who}] ${message}`;
  timeline.push(line);
  console.log(line);
}

function fail(message) {
  failures.push(message);
  log('server', `FAIL ${message}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function buildBundle(deviceKey) {
  const outDir = path.join(os.tmpdir(), '64squares-realtime');
  mkdirSync(outDir, { recursive: true });
  const outfile = path.join(outDir, `bundle-${deviceKey}.js`);
  await esbuild.build({
    entryPoints: [path.join(realtimeDir, 'entry.tsx')],
    outfile,
    bundle: true,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    tsconfig: path.join(repoRoot, 'tsconfig.json'),
    absWorkingDir: repoRoot,
    banner: { js: 'window.process={env:{NODE_ENV:"production"}};' },
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(`http://127.0.0.1:${PORT}`),
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(DEVICES[deviceKey].key),
    },
    alias: {
      'next/navigation': path.join(realtimeDir, 'fake-navigation.ts'),
    },
    loader: { '.css': 'empty' },
    logLevel: 'warning',
  });
  return readFileSync(outfile, 'utf8');
}

function opponentNoteCount(label, square) {
  const needle = `>>> AUDIO opponent-synth square=${square}`;
  return timeline.filter((line) => line.includes(`[${label}]`) && line.includes(needle)).length;
}

function joinCount(label) {
  return timeline.filter((line) => line.includes(`[${label}] WS_JOIN `)).length;
}

let browser;
let fake;
let sampler;

const watchdog = setTimeout(() => {
  console.error('realtime harness timed out after 120s');
  process.exit(1);
}, 120_000);

try {
  if (!existsSync(chromePath)) {
    throw new Error(`Chrome not found at ${chromePath}. Set CHROME_PATH to the binary.`);
  }

  log('server', `chrome=${chromePath} latency=${latencyMs}ms dropHalfMove=${dropOnHalfMove}`);
  const bundles = {
    A: await buildBundle('A'),
    B: await buildBundle('B'),
  };
  const apikeyToDevice = Object.fromEntries(Object.entries(DEVICES).map(([key, device]) => [device.key, device.label]));
  fake = createFakeSupabase({
    port: PORT,
    bundles,
    apikeyToDevice,
    log,
    activationMs,
  });
  await fake.listen();

  browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: !measureOutput,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  async function openDevice(deviceKey) {
    const config = DEVICES[deviceKey];
    const page = await browser.newPage();
    const device = {
      ...config,
      key: deviceKey,
      page,
      name: config.label,
      subscribed: false,
      initialized: false,
      audioReady: false,
    };

    page.on('pageerror', (err) => {
      log(device.name, `PAGEERROR ${err.message}`);
      failures.push(`${device.name} page error: ${err.message}`);
    });
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Successfully subscribed to realtime updates')) device.subscribed = true;
      if (text.includes('Initialization complete')) device.initialized = true;
      if (text.includes('Audio callback set up')) device.audioReady = true;
      if (text.includes('Tone.js') || text.includes('React DevTools')) return;
      if (text.startsWith('Render - Game state') || text.startsWith('Match updated via realtime')) return;
      if (text.includes('Audio callback set up')) return;
      if (text.includes('Failed to load resource')) return;
      log(device.name, `console.${msg.type()}: ${text.slice(0, 240)}`);
    });
    await page.exposeFunction('probeLog', (message) => log(device.name, message));

    if (latencyMs > 0) {
      const cdp = await page.createCDPSession();
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: latencyMs,
        downloadThroughput: (4 * 1024 * 1024) / 8,
        uploadThroughput: (1 * 1024 * 1024) / 8,
      });
      log(device.name, `NETWORK_THROTTLED latency=${latencyMs}ms`);
    }

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(
      (matchId, guest) => {
        window.__matchId = matchId;
        window.__guestName = guest;
        window.sessionStorage.setItem('64squares_guest_name', guest);
      },
      fake.matchId,
      config.guest
    );
    await page.addScriptTag({ url: `/bundle-${deviceKey}.js` });
    await page.evaluate(() => window.__mount());
    return device;
  }

  async function waitFor(device, flag, label) {
    const start = Date.now();
    while (Date.now() - start < 20_000) {
      if (device[flag]) return;
      await sleep(50);
    }
    throw new Error(`${device.name} timed out waiting for ${label}`);
  }

  async function enableAudio(device) {
    await device.page.waitForFunction(
      () => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Enable Audio')),
      { timeout: 20_000, polling: POLL_MS }
    );
    await device.page.evaluate(() => {
      [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Enable Audio'))?.click();
    });
    log(device.name, 'CLICKED Enable Audio');
    await waitFor(device, 'audioReady', 'audio callback');
  }

  function squareIndex(square, orientation) {
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]);
    const rankRow = orientation === 'w' ? 8 - rank : rank - 1;
    const fileCol = orientation === 'w' ? file : 7 - file;
    return rankRow * 8 + fileCol;
  }

  async function clickSquare(device, square) {
    const ok = await device.page.evaluate((idx) => {
      const cell = document.querySelector('.grid.grid-cols-8')?.children[idx];
      if (!cell) return false;
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    }, squareIndex(square, device.orientation));
    if (!ok) log(device.name, `CLICK_FAILED ${square}`);
    return ok;
  }

  async function selectSquare(device, square) {
    if (!(await clickSquare(device, square))) return false;
    try {
      await device.page.waitForFunction(
        () =>
          [...document.querySelectorAll('.grid.grid-cols-8 > *')].some((cell) =>
            String(cell.className).includes('bg-green-')
          ),
        { timeout: 3_000, polling: POLL_MS }
      );
      return true;
    } catch {
      return false;
    }
  }

  async function playMove(device, from, to) {
    log(device.name, `=== ${device.name} PLAYS ${from}-${to} ===`);
    // The match page remounts the board (new key) when the opponent's move
    // lands, and the note plays before that commit. A click in that gap
    // selects on the outgoing board and the selection is lost, so tap again
    // the way a player would.
    let selected = await selectSquare(device, from);
    if (!selected) {
      log(device.name, `NO_LEGAL_HIGHLIGHT after selecting ${from}, retrying`);
      selected = await selectSquare(device, from);
    }
    if (!selected) {
      log(device.name, `NO_LEGAL_HIGHLIGHT after selecting ${from}`);
      return false;
    }
    return clickSquare(device, to);
  }

  async function peakRmsSince(device, sinceTs) {
    return device.page.evaluate((ts) => {
      const probe = window.__output;
      if (!probe) return 0;
      return probe.samples.filter((sample) => sample.t >= ts).reduce((max, sample) => Math.max(max, sample.rms), 0);
    }, sinceTs);
  }

  async function waitForAudibleOutput(device, sinceTs) {
    const started = Date.now();
    while (Date.now() - started < maxIntervalMs) {
      if ((await peakRmsSince(device, sinceTs)) > AUDIBLE_RMS) return true;
      await sleep(50);
    }
    return false;
  }

  // Every note rings for 20s, so a level that has collapsed a few seconds
  // after the move means something released or disposed the graph.
  async function checkStillRinging(device, moveStartedAt, description) {
    const remaining = moveStartedAt + RING_CHECK_MS - Date.now();
    if (remaining > 0) await sleep(remaining);
    const level = await peakRmsSince(device, Date.now() - 400);
    if (level < STILL_RINGING_RMS) {
      fail(`${device.name} went silent ${RING_CHECK_MS}ms after ${description} (rms=${level.toFixed(4)})`);
    } else {
      log('server', `PASS ${device.name} still ringing after ${description} (rms=${level.toFixed(3)})`);
    }
  }

  async function waitForOpponentNote(listener, square) {
    const before = opponentNoteCount(listener.name, square);
    const started = Date.now();
    let heard = false;
    while (Date.now() - started < maxIntervalMs) {
      if (opponentNoteCount(listener.name, square) > before) {
        heard = true;
        break;
      }
      await sleep(40);
    }
    const elapsed = Date.now() - started;
    if (heard && elapsed < minIntervalMs) await sleep(minIntervalMs - elapsed);
    return heard;
  }

  const alice = await openDevice('A');
  await waitFor(alice, 'subscribed', 'realtime subscribe');
  await enableAudio(alice);
  await waitFor(alice, 'initialized', 'initialization');

  log('server', '--- Bob joins via landing page ---');
  fake.applyJoin({ blackPlayerName: 'Bob', blackSynth: 'FMSynth' });

  const bob = await openDevice('B');
  await waitFor(bob, 'subscribed', 'realtime subscribe');
  await enableAudio(bob);
  await waitFor(bob, 'initialized', 'initialization');

  for (const device of [alice, bob]) {
    await device.page.waitForFunction(
      () => document.querySelector('.grid.grid-cols-8')?.children.length === 64,
      { timeout: 15_000, polling: POLL_MS }
    );
  }

  const deafSamples = {
    [DEVICES.A.label]: { deaf: 0, total: 0 },
    [DEVICES.B.label]: { deaf: 0, total: 0 },
  };
  sampler = setInterval(() => {
    for (const label of Object.keys(deafSamples)) {
      deafSamples[label].total += 1;
      if (!fake.hasActiveSubscription(label)) deafSamples[label].deaf += 1;
    }
  }, 25);

  let droppedListener = null;
  for (const [index, [from, to]] of MOVES.entries()) {
    const device = index % 2 === 0 ? alice : bob;
    const listener = index % 2 === 0 ? bob : alice;
    const halfMove = index + 1;
    log('server', `########## HALF-MOVE ${halfMove}: ${device.name} ${from}-${to} ##########`);
    if (halfMove === dropOnHalfMove) {
      fake.dropNextMoveInsertFor(listener.name);
      droppedListener = listener;
      log('server', `dropping moves INSERT for ${listener.name}`);
    }
    const moveStartedAt = Date.now();
    const played = await playMove(device, from, to);
    if (!played) {
      fail(`${device.name} could not play ${from}-${to}`);
      continue;
    }
    const heard = await waitForOpponentNote(listener, to);
    if (!heard) {
      const dropped = halfMove === dropOnHalfMove ? ' after the moves INSERT was dropped' : '';
      fail(`${listener.name} did not hear ${from}-${to}${dropped}`);
    } else if (halfMove === dropOnHalfMove) {
      log('server', `PASS ${listener.name} heard ${to} after the moves INSERT was dropped`);
    }

    if (!measureOutput) continue;
    const description = `${device.name} played ${from}-${to}`;
    for (const [who, role] of [[device, 'own'], [listener, 'opponent']]) {
      if (await waitForAudibleOutput(who, moveStartedAt)) {
        log('server', `PASS ${who.name} output audible for ${role} note ${to}`);
      } else {
        fail(`${who.name} produced no output for ${role} note ${to}`);
      }
    }
    await checkStillRinging(device, moveStartedAt, description);
    await checkStillRinging(listener, moveStartedAt, description);
  }

  log('server', '--- Bob returns home ---');
  const left = await bob.page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('Back to Home'));
    if (!button) return false;
    button.click();
    return true;
  });
  if (!left) {
    fail('Bob has no Back to Home button');
  } else {
    try {
      await alice.page.waitForFunction(
        () => document.body.textContent?.includes('Bob has left the room.'),
        { timeout: 5_000, polling: POLL_MS }
      );
      log('server', 'PASS Alice saw that Bob left the room');
    } catch {
      fail('Alice was not told that Bob left the room');
      log('server', `db chat: ${JSON.stringify(fake.db.chatMessages)}`);
      const aliceText = await alice.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1500));
      log('server', `Alice body: ${aliceText}`);
    }
  }

  clearInterval(sampler);
  sampler = undefined;

  const numbers = fake.db.moves.map((move) => move.move_number);
  log('server', `db moves: ${fake.db.moves.map((move) => `${move.move_from}-${move.move_to}#${move.move_number}`).join(' ')}`);
  log('server', `joined topics: A=${fake.joinedTopicCount(DEVICES.A.label)} B=${fake.joinedTopicCount(DEVICES.B.label)}`);
  for (const [label, stats] of Object.entries(deafSamples)) {
    log('server', `${label} unsubscribed samples ${stats.deaf}/${stats.total}`);
  }

  const joinsA = joinCount(DEVICES.A.label);
  const joinsB = joinCount(DEVICES.B.label);
  if (joinsA === 1 && joinsB === 1) {
    log('server', 'PASS exactly one channel join per device');
  } else {
    fail(`expected exactly one channel join per device, got A=${joinsA} B=${joinsB}`);
  }

  for (const [label, stats] of Object.entries(deafSamples)) {
    if (stats.total > 0 && stats.deaf === 0) {
      log('server', `PASS ${label} stayed subscribed for the whole game`);
    } else {
      fail(`${label} had no active subscription for ${stats.deaf}/${stats.total} samples during the game`);
    }
  }

  const dropWasForced = timeline.some((line) => line.includes('simulated deaf window'));
  if (dropWasForced && droppedListener) {
    log('server', `PASS moves INSERT was dropped for ${droppedListener.name}`);
  } else {
    fail('the harness did not drop a moves INSERT, so the sound bug was not forced');
  }

  const expectedNumbers = MOVES.map((_, index) => index + 1);
  if (numbers.length === expectedNumbers.length && numbers.every((value, index) => value === expectedNumbers[index])) {
    log('server', `PASS move numbers start at 1 (${numbers.join(',')})`);
  } else {
    fail(`move numbers should start at 1 and run ${expectedNumbers.join(',')}, got ${numbers.join(',') || 'none'}`);
  }
} catch (err) {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(message);
  failures.push(message.split('\n')[0]);
} finally {
  clearTimeout(watchdog);
  if (sampler) clearInterval(sampler);
  if (browser) {
    try {
      await browser.close();
    } catch (err) {
      console.error(err);
    }
  }
  if (fake) {
    try {
      await fake.close();
    } catch (err) {
      console.error(err);
    }
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} realtime failure(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\nrealtime harness passed');
