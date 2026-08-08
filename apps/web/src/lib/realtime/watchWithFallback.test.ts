import { describe, it, expect, vi } from "vitest";
import { watchWithFallback } from "./watchWithFallback.js";

describe("watchWithFallback", () => {
  it("falls back to polling when the listener errors", () => {
    vi.useFakeTimers();
    const poll = vi.fn();
    const unsub = watchWithFallback(
      (_onData, onError) => { onError(new Error("listener failed")); return () => {}; },
      poll, 10000,
    );
    vi.advanceTimersByTime(25000);
    expect(poll).toHaveBeenCalledTimes(2);
    unsub();
    vi.advanceTimersByTime(20000);
    expect(poll).toHaveBeenCalledTimes(2); // stopped after unsub
    vi.useRealTimers();
  });

  it("does not poll when the listener is healthy", () => {
    vi.useFakeTimers();
    const poll = vi.fn();
    const unsub = watchWithFallback(
      (_onData) => { _onData("data"); return () => {}; },
      poll, 10000,
    );
    vi.advanceTimersByTime(30000);
    expect(poll).not.toHaveBeenCalled();
    unsub();
    vi.useRealTimers();
  });

  it("calls unsubscribe on the listener when unsubbed", () => {
    vi.useFakeTimers();
    const listenerUnsub = vi.fn();
    const unsub = watchWithFallback(
      () => listenerUnsub,
      vi.fn(), 10000,
    );
    unsub();
    expect(listenerUnsub).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
