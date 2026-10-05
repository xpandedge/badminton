"use client";
import { useEffect, useState } from "react";
import { getBoardData, type BoardData } from "@/server/sessions/board";
import { TvBoard } from "./TvBoard";
import styles from "./tv.module.css";

export function LiveTvBoard({ code }: { code: string }) {
  const [snapshot, setSnapshot] = useState<{ data: BoardData; updatedAt: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    setSnapshot(null);
    setError("");
    async function poll() {
      try {
        const result = await getBoardData(code);
        if (disposed) return;
        if (result.ok) { setSnapshot({ data: result.data, updatedAt: Date.now() }); setError(""); }
        else {
          setError(result.message);
          if (["NOT_FOUND", "FORBIDDEN", "UNAUTHENTICATED"].includes(result.code)) setSnapshot(null);
        }
      } catch { if (!disposed) setError("Connection lost. Retrying automatically…"); }
    finally { if (!disposed) timer = setTimeout(poll, 5_000); }
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [code]);
  return snapshot ? <TvBoard data={snapshot.data} updatedAt={snapshot.updatedAt} disconnected={!!error} /> : <div className={styles.screen}><h1>DuoRally TV</h1><p role="status">{error || "Loading court assignments…"}</p></div>;
}
