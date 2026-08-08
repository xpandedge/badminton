export function safeUnsubscribe(unsub: () => void): void {
  try {
    unsub();
  } catch (error) {
    console.warn("Firestore listener cleanup failed", error);
  }
}

export function watchWithFallback(
  subscribe: (onData: (v: unknown) => void, onError: (e: unknown) => void) => () => void,
  poll: () => void,
  intervalMs = 12000,
): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  const startPolling = () => {
    if (timer === null) {
      timer = setInterval(poll, intervalMs);
    }
  };

  const stopPolling = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const unsub = subscribe((_v) => { /* listener healthy — no-op */ }, () => startPolling());

  return () => {
    stopPolling();
    safeUnsubscribe(unsub);
  };
}
