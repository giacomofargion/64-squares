export function useParams() {
  return { id: (window as unknown as { __matchId: string }).__matchId };
}

export function useRouter() {
  return {
    push: (url: string) => {
      (window as unknown as { probeLog: (m: string) => void }).probeLog(`ROUTER_PUSH ${url}`);
    },
    replace: (url: string) => {
      (window as unknown as { probeLog: (m: string) => void }).probeLog(`ROUTER_REPLACE ${url}`);
    },
  };
}
