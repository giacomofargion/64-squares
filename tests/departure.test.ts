import { describe, expect, it } from 'vitest';
import { departureMessage, departurePlayerName } from '@/lib/match/departure';

describe('departure notices', () => {
  it('round-trips a player name through the chat notice', () => {
    expect(departurePlayerName(departureMessage('Ada'))).toBe('Ada');
  });

  it('ignores ordinary chat', () => {
    expect(departurePlayerName('has left the room.')).toBeNull();
    expect(departurePlayerName('I left the room early')).toBeNull();
  });
});
