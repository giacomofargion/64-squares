import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('/tmp/64squares-tests', { recursive: true });
const outfile = '/tmp/64squares-tests/roomCode.mjs';
execFileSync('/tmp/audio-probe/node_modules/.bin/esbuild', [
  '/workspace/lib/roomCode.ts',
  '--bundle',
  '--platform=node',
  '--format=esm',
  `--outfile=${outfile}`,
  '--tsconfig=/workspace/tsconfig.json',
  '--log-level=warning',
]);

const { generateRoomCode, isValidUUID, findMatchByCode, normalizeRoomCode } = await import(
  pathToFileURL(outfile).href
);

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, pass: false, error: err instanceof Error ? err.message : String(err) });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err instanceof Error ? err.message : err}`);
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const uuid = '11111111-2222-3333-4444-555555555555';

check('generateRoomCode is last 7 hex digits of the UUID', () => {
  assert(generateRoomCode(uuid) === '5555555', `got ${generateRoomCode(uuid)}`);
});

check('isValidUUID accepts canonical UUIDs and rejects garbage', () => {
  assert(isValidUUID(uuid) === true, 'canonical');
  assert(isValidUUID('5555555') === false, 'short code is not a UUID');
  assert(isValidUUID('not-a-uuid') === false, 'garbage');
  assert(isValidUUID(uuid.toUpperCase()) === true, 'uppercase UUID');
});

const asyncResults = [];

async function acheck(name, fn) {
  try {
    await fn();
    asyncResults.push({ name, pass: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    asyncResults.push({ name, pass: false, error: err instanceof Error ? err.message : String(err) });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err instanceof Error ? err.message : err}`);
  }
}

await acheck('findMatchByCode returns null for invalid format without querying', async () => {
  const fake = {
    from() {
      throw new Error('should not query');
    },
  };
  assert((await findMatchByCode(fake, 'abc')) === null, 'too short');
  assert((await findMatchByCode(fake, 'abcdefgh')) === null, 'too long / non-hex g');
  assert((await findMatchByCode(fake, 'zzzzzzz')) === null, 'not hex');
});

await acheck('findMatchByCode matches the UUID suffix among returned rows', async () => {
  const fake = {
    from() {
      return {
        select() {
          return {
            order() {
              return {
                limit: async () => ({
                  data: [
                    { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', status: 'waiting', black_player_name: null },
                    { id: uuid, status: 'waiting', black_player_name: null },
                  ],
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };
  const found = await findMatchByCode(fake, '5555555');
  assert(found?.id === uuid, `got ${JSON.stringify(found)}`);
});

await acheck('findMatchByCode is case-insensitive', async () => {
  const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeea1b2c';
  const fake = {
    from() {
      return {
        select() {
          return {
            order() {
              return {
                limit: async () => ({
                  data: [{ id, status: 'active', black_player_name: 'Bob' }],
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };
  const found = await findMatchByCode(fake, 'EEA1B2C');
  assert(found?.id === id, `got ${JSON.stringify(found)}`);
});

await acheck('normalizeRoomCode returns a UUID as-is when it exists', async () => {
  const fake = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => ({ data: { id: uuid } }),
              };
            },
          };
        },
      };
    },
  };
  const id = await normalizeRoomCode(fake, `  ${uuid}  `);
  assert(id === uuid, `got ${id}`);
});

await acheck('normalizeRoomCode returns null for a well-formed UUID that is missing', async () => {
  const fake = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => ({ data: null }),
              };
            },
          };
        },
      };
    },
  };
  const id = await normalizeRoomCode(fake, uuid);
  assert(id === null, `got ${id}`);
});

const all = [...results, ...asyncResults];
const failed = all.filter((r) => !r.pass);
writeFileSync('/tmp/64squares-tests/room-code.json', JSON.stringify({ results: all, failed: failed.length }, null, 2));
console.log(`\n${all.length - failed.length}/${all.length} passed`);
process.exit(failed.length ? 1 : 0);
