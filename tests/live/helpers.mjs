import puppeteer from 'puppeteer-core';
import { instrument } from './instrument.mjs';

export const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:3200';
export const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function realClick(page, handleOrSelector) {
  const el =
    typeof handleOrSelector === 'string'
      ? await page.waitForSelector(handleOrSelector, { timeout: 20000 })
      : handleOrSelector;
  if (!el) throw new Error(`realClick: missing ${handleOrSelector}`);
  await el.scrollIntoView();
  const box = await el.boundingBox();
  if (!box) throw new Error('element has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

export async function clickByText(page, pattern, { role, timeout = 20000 } = {}) {
  const started = Date.now();
  const selector = role ? `[role="${role}"]` : 'button';
  while (Date.now() - started < timeout) {
    const handle = await page.evaluateHandle(
      (sel, src) => {
        const rx = new RegExp(src, 'i');
        const nodes = [...document.querySelectorAll(sel)];
        return (
          nodes.find((b) => {
            const visible = !!(b.offsetWidth || b.offsetHeight || b.getClientRects().length);
            return visible && rx.test((b.textContent || '').trim());
          }) || null
        );
      },
      selector,
      pattern
    );
    const el = handle.asElement();
    if (el) {
      await realClick(page, el);
      return;
    }
    await sleep(150);
  }
  throw new Error(`no ${selector} matching /${pattern}/`);
}

export async function typeInto(page, id, value) {
  await page.waitForSelector(`#${id}`, { timeout: 20000 });
  await page.click(`#${id}`, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(`#${id}`, value, { delay: 15 });
}

export async function selectVisibleSynth(page, name) {
  await page.waitForFunction(
    () => [...document.querySelectorAll('[role="combobox"]')].some((el) => el.offsetParent !== null),
    { timeout: 15000 }
  );
  const combo = await page.evaluateHandle(() => {
    return [...document.querySelectorAll('[role="combobox"]')].find((el) => el.offsetParent !== null) || null;
  });
  await realClick(page, combo.asElement());
  await page.waitForSelector('[role="option"]', { timeout: 10000 });
  await clickByText(page, `^\\s*${name}\\s*$`, { role: 'option' });
}

export const squareIndex = (square, orientation) => {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const row = orientation === 'w' ? 8 - rank : rank - 1;
  const col = orientation === 'w' ? file : 7 - file;
  return row * 8 + col;
};

export async function clickSquare(page, square, orientation) {
  const handle = await page.evaluateHandle((i) => {
    return document.querySelector('.grid.grid-cols-8')?.children[i] || null;
  }, squareIndex(square, orientation));
  const el = handle.asElement();
  if (!el) throw new Error(`no cell for ${square}`);
  await realClick(page, el);
}

export async function playMove(page, from, to, orientation) {
  await clickSquare(page, from, orientation);
  await sleep(180);
  await clickSquare(page, to, orientation);
}

export async function enableAudio(page) {
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => /enable audio/i.test(b.textContent || '')),
    { timeout: 25000 }
  );
  await sleep(400);
  await clickByText(page, 'enable audio');
  await page.evaluate(() => window.__markAudioStarted?.());
}

export async function dismissAudioIfPresent(page, { enable = true } = {}) {
  const present = await page.evaluate(
    () => [...document.querySelectorAll('button')].some((b) => /enable audio/i.test(b.textContent || ''))
  );
  if (!present) return false;
  if (enable) {
    await clickByText(page, 'enable audio');
    await page.evaluate(() => window.__markAudioStarted?.());
  } else {
    await page.keyboard.press('Escape');
  }
  return true;
}

export async function pageText(page) {
  return page.evaluate(() => document.body.innerText || '');
}

export async function waitForText(page, pattern, timeout = 20000) {
  const rx = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  await page.waitForFunction(
    (src) => new RegExp(src, 'i').test(document.body.innerText || ''),
    { timeout },
    rx.source
  );
}

export async function readRoomCode(page) {
  return page.evaluate(() => {
    const label = [...document.querySelectorAll('span, p, div')].find((s) =>
      /^Room Code:?$/i.test((s.textContent || '').trim())
    );
    const root = label?.parentElement;
    return root?.querySelector('.font-mono')?.textContent?.trim() || null;
  });
}

export async function boardOccupancy(page, orientation) {
  return page.evaluate((orient) => {
    const cells = document.querySelector('.grid.grid-cols-8')?.children;
    if (!cells || cells.length !== 64) return null;
    const out = {};
    for (let i = 0; i < 64; i++) {
      const img = cells[i].querySelector('img');
      const row = Math.floor(i / 8);
      const col = i % 8;
      const rank = orient === 'w' ? 8 - row : row + 1;
      const file = String.fromCharCode(97 + (orient === 'w' ? col : 7 - col));
      out[`${file}${rank}`] = img ? img.getAttribute('alt') : null;
    }
    return out;
  }, orientation);
}

export async function hasLastMoveHighlight(page) {
  return page.evaluate(() => {
    const cells = [...(document.querySelector('.grid.grid-cols-8')?.children || [])];
    return cells.some((c) => /bg-blue-300|bg-blue-700/.test(c.className));
  });
}

export async function legalDotCount(page) {
  return page.evaluate(() => document.querySelectorAll('.grid.grid-cols-8 .bg-green-500').length);
}

export async function probeSnapshot(page) {
  return page.evaluate(() => {
    const p = window.__probe;
    if (!p) return null;
    return {
      resubscribes: p.resubscribes,
      subscribed: p.subscribed,
      audioStartedAt: p.audioStartedAt,
      oscStarts: p.oscStarts.slice(),
      samples: p.samples.slice(-200),
    };
  });
}

export async function noteStartsSince(page, afterTs) {
  return page.evaluate((ts) => {
    const p = window.__probe;
    if (!p) return 0;
    const ignoreBefore = (p.audioStartedAt || 0) + 1500;
    const floor = Math.max(ts, ignoreBefore);
    return p.oscStarts.filter((t) => t >= floor).length;
  }, afterTs);
}

export async function peakRmsSince(page, afterTs) {
  return page.evaluate((ts) => {
    const p = window.__probe;
    if (!p) return 0;
    return p.samples.filter((s) => s.t >= ts).reduce((m, s) => Math.max(m, s.rms), 0);
  }, afterTs);
}

export async function openDevice({ key, guest, role, orientation, accent, x, profileTag }) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    defaultViewport: null,
    userDataDir: `/tmp/64squares-tests/profile-${profileTag || 'run'}-${key}-${Date.now()}`,
    args: [
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-crash-restore-bubble',
      '--disable-features=Translate,MediaRouter',
      `--window-position=${x ?? (key === 'A' ? 0 : 960)},0`,
      '--window-size=960,1200',
    ],
  });
  const [page] = await browser.pages();
  page.setDefaultTimeout(25000);
  await page.evaluateOnNewDocument(instrument, {
    label: `DEVICE ${key}  ·  ${guest} (${role})`,
    sublabel: 'functional sweep',
    accent: accent || (key === 'A' ? '#4da3ff' : '#ffb648'),
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  return { key, guest, role, orientation, browser, page, errors };
}

export async function closeDevice(device) {
  try {
    await device?.browser?.close();
  } catch {
    /* ignore */
  }
}

/** On viewports below the `lg` breakpoint the chat panel is collapsed. */
export async function openChat(page) {
  await page.evaluate(() => {
    const open = document.querySelector('button[aria-label="Open chat"]');
    if (open) open.click();
  });
  await sleep(400);
}
