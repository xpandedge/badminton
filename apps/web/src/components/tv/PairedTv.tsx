"use client";
import { useEffect, useRef, useState } from "react";
import { beginTvPairing, readTvDisplay } from "@/server/tv/actions";
import type { BoardData } from "@/lib/sessions/board";
import { TvBoard } from "./TvBoard";
import styles from "./tv.module.css";

export function TokenTv({ token }: { token: string }) {
  const [snapshot, setSnapshot] = useState<{ data: BoardData; updatedAt: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    setSnapshot(null); setError("");
    async function poll() {
      let delay = 3000;
      try {
        const result = await readTvDisplay(token);
        if (disposed) return;
        if (result.ok) {
          setError("");
          if (result.data) { setSnapshot({ data: result.data, updatedAt: Date.now() }); delay = 5_000; }
        } else {
          setError(result.message);
          if (["NOT_FOUND", "FORBIDDEN", "UNAUTHENTICATED"].includes(result.code)) { setSnapshot(null); return; }
        }
      } catch { if (!disposed) setError("Connection lost. Retrying…"); }
      if (!disposed) timer = setTimeout(poll, delay);
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [token]);
  if (snapshot) return <TvBoard data={snapshot.data} updatedAt={snapshot.updatedAt} disconnected={!!error} />;
  return <p role="status">{error || "Waiting for the organiser to connect…"}</p>;
}

export function PairedTv() {
  const [pair, setPair] = useState<{ token: string; pairCode: string } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const request = useRef<ReturnType<typeof beginTvPairing> | null>(null);
  useEffect(() => {
    let disposed = false;
    request.current ??= beginTvPairing();
    request.current.then(result => {
      if (disposed) return;
      if (result.ok) { setPair(result.data); setError(""); }
      else setError(result.message);
    }).catch(() => { if (!disposed) setError("Unable to connect. Please try again."); });
    return () => { disposed = true; };
  }, [attempt]);
  return <div className={styles.pairScreen}>
    <div className={styles.pairInstructions}><h1>DuoRally TV</h1><p>On your phone, open the session’s public board and choose <b>Connect a TV</b>.</p>
      {pair && <><p>Enter this code on your phone</p><strong className={styles.pairCode}>{pair.pairCode.slice(0, 4)}–{pair.pairCode.slice(4)}</strong><p>This code expires after 10 minutes.</p></>}
      {!pair && <p role="status">{error || "Creating your pairing code…"}</p>}
      <button onClick={() => { request.current = null; setPair(null); setError(""); setAttempt(n => n + 1); }}>Get a new code</button>
      {pair && <TokenTv key={pair.token} token={pair.token} />}
    </div>
  </div>;
}
