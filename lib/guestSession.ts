/**
 * Utility functions for managing guest player names in sessionStorage
 */

const GUEST_NAME_KEY = '64squares_guest_name';

/**
 * Store guest name in sessionStorage
 */
export function setGuestName(name: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(GUEST_NAME_KEY, name);
  }
}

/**
 * Retrieve guest name from sessionStorage
 */
export function getGuestName(): string | null {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem(GUEST_NAME_KEY);
  }
  return null;
}

/**
 * Clear guest name from sessionStorage
 */
export function clearGuestName(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(GUEST_NAME_KEY);
  }
}
