import { describe, expect, it } from 'vitest';
import { findMatchByCode, generateRoomCode, isValidUUID, normalizeRoomCode } from '@/lib/roomCode';

const uuid = '11111111-2222-3333-4444-555555555555';

type MatchRow = { id: string; status?: string; black_player_name?: string | null };

/**
 * Stand-in for the two query shapes roomCode.ts actually uses.
 * Nothing here opens a socket.
 */
function fakeClient(options: { rows?: MatchRow[]; uuidHit?: string | null; queried?: { id?: string; code?: string } }) {
  return {
    from() {
      return {
        select() {
          return {
            eq(_column: string, value: string) {
              if (options.queried) options.queried.id = value;
              return {
                single: async () => ({ data: options.uuidHit ? { id: options.uuidHit } : null }),
              };
            },
            order() {
              return {
                limit: async () => {
                  options.queried = { ...options.queried, code: 'queried' };
                  return { data: options.rows ?? [], error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('room codes', () => {
  it('builds a 7-character code from the end of the UUID', () => {
    expect(generateRoomCode(uuid)).toBe('5555555');
    expect(generateRoomCode(uuid)).toMatch(/^[0-9a-f]{7}$/i);
    expect(generateRoomCode('aaaaaaaa-bbbb-cccc-dddd-eeeeeeea1b2c')).toBe('eea1b2c');
    expect(generateRoomCode('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEA1B2C')).toBe('EEA1B2C');
  });

  it('accepts a canonical UUID and rejects a short code or garbage', () => {
    expect(isValidUUID(uuid)).toBe(true);
    expect(isValidUUID(uuid.toUpperCase())).toBe(true);
    expect(isValidUUID('5555555')).toBe(false);
    expect(isValidUUID('not-a-uuid')).toBe(false);
    expect(isValidUUID(`  ${uuid}`)).toBe(false);
  });

  it('rejects a code that is not 7 hex digits before querying', async () => {
    const fake = {
      from() {
        throw new Error('should not query');
      },
    };
    await expect(findMatchByCode(fake, 'abc')).resolves.toBeNull();
    await expect(findMatchByCode(fake, 'abcdefgh')).resolves.toBeNull();
    await expect(findMatchByCode(fake, 'zzzzzzz')).resolves.toBeNull();
    await expect(findMatchByCode(fake, ' 5555555')).resolves.toBeNull();
  });

  it('matches a short code against the UUID suffix, ignoring case', async () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeea1b2c';
    const fake = fakeClient({
      rows: [
        { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', status: 'waiting' },
        { id, status: 'active', black_player_name: 'Bob' },
      ],
    });
    await expect(findMatchByCode(fake, 'EEA1B2C')).resolves.toEqual({ id });
  });

  it('returns null when the lookup errors or no suffix matches', async () => {
    const missing = fakeClient({ rows: [{ id: uuid }] });
    await expect(findMatchByCode(missing, 'abc1234')).resolves.toBeNull();

    const broken = {
      from() {
        return {
          select() {
            return {
              order() {
                return { limit: async () => ({ data: null, error: { message: 'down' } }) };
              },
            };
          },
        };
      },
    };
    await expect(findMatchByCode(broken, '5555555')).resolves.toBeNull();
  });

  it('trims input and returns a UUID that exists', async () => {
    const queried: { id?: string } = {};
    const fake = fakeClient({ uuidHit: uuid, queried });
    await expect(normalizeRoomCode(fake, `  ${uuid.toUpperCase()}  `)).resolves.toBe(uuid.toUpperCase());
    expect(queried.id).toBe(uuid.toUpperCase());
  });

  it('returns null for a well-formed UUID that is missing', async () => {
    const fake = fakeClient({ uuidHit: null });
    await expect(normalizeRoomCode(fake, uuid)).resolves.toBeNull();
  });

  it('trims a short code and resolves it to the match id', async () => {
    const fake = fakeClient({ rows: [{ id: uuid, status: 'waiting' }] });
    await expect(normalizeRoomCode(fake, '  5555555  ')).resolves.toBe(uuid);
  });
});
