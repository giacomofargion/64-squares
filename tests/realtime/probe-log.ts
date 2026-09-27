export function log(message: string): void {
  (window as unknown as { probeLog: (m: string) => void }).probeLog(message);
}
