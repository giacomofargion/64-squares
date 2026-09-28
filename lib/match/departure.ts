const DEPARTURE_SUFFIX = ' has left the room.';

export function departureMessage(playerName: string): string {
  return `${playerName}${DEPARTURE_SUFFIX}`;
}

/** Name embedded in a departure notice, or null when the text is an ordinary chat line. */
export function departurePlayerName(message: string): string | null {
  if (!message.endsWith(DEPARTURE_SUFFIX)) return null;
  const name = message.slice(0, -DEPARTURE_SUFFIX.length).trim();
  return name.length > 0 ? name : null;
}
