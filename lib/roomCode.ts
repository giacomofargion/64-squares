/**
 * Utility functions for room code generation and lookup
 */

/**
 * Generate a short room code from a UUID
 * Takes the last 7 digits (after removing hyphens)
 */
export function generateRoomCode(uuid: string): string {
  // Remove hyphens and take last 7 characters
  const cleanUuid = uuid.replace(/-/g, '');
  return cleanUuid.slice(-7);
}

/**
 * Find a match by short room code
 * Searches all matches and checks if the code matches the end of any UUID
 */
export async function findMatchByCode(
  supabase: any,
  code: string
): Promise<{ id: string } | null> {
  // Validate code format (should be 7 digits/hex characters)
  if (!/^[0-9a-f]{7}$/i.test(code)) {
    return null;
  }

  // Get all waiting matches (or all matches if needed)
  // We'll need to fetch and filter client-side since we can't easily search by UUID suffix in SQL
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id')
    .eq('status', 'waiting')
    .or('black_player_id.is.null,black_player_name.is.null');

  if (error || !matches) {
    return null;
  }

  // Find match where UUID ends with the code
  const match = matches.find((m: { id: string }) => {
    const matchCode = generateRoomCode(m.id);
    return matchCode.toLowerCase() === code.toLowerCase();
  });

  return match || null;
}

/**
 * Check if a string is a valid UUID format
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Normalize room code input - accepts both short codes and full UUIDs
 * Returns the full UUID if found, or null if not found
 */
export async function normalizeRoomCode(
  supabase: any,
  input: string
): Promise<string | null> {
  const trimmed = input.trim();

  // If it's already a valid UUID, return it
  if (isValidUUID(trimmed)) {
    // Verify it exists
    const { data } = await supabase
      .from('matches')
      .select('id')
      .eq('id', trimmed)
      .single();
    return data ? trimmed : null;
  }

  // Otherwise, try to find by short code
  const match = await findMatchByCode(supabase, trimmed);
  return match ? match.id : null;
}
