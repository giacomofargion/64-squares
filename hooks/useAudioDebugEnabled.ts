'use client';

import { useSyncExternalStore } from 'react';

const subscribeNever = () => () => {};
const readOnClient = () => new URLSearchParams(window.location.search).has('audiodebug');
const readOnServer = () => false;

/** True when the page was opened with `?audiodebug=1`. */
export function useAudioDebugEnabled(): boolean {
  return useSyncExternalStore(subscribeNever, readOnClient, readOnServer);
}
