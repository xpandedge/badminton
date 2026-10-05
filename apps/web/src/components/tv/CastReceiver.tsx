"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { CAST_NAMESPACE, parseCastMessage } from "@/lib/tv/connection";
import type { CastWindow } from "@/lib/tv/cast-sdk";
import { TokenTv } from "./PairedTv";
import styles from "./tv.module.css";

export function CastReceiver() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);
  useEffect(() => {
    if (!ready) return;
    const framework = (window as CastWindow).cast?.framework;
    const context = framework?.CastReceiverContext?.getInstance();
    if (!context) { setError("Open this receiver through Google Cast from DuoRally."); return; }
    const listener = (event: { data: unknown; senderId: string }) => {
      const next = parseCastMessage(event.data);
      if (!next) { context.sendCustomMessage(CAST_NAMESPACE, event.senderId, { type: "error", message: "Invalid display message" }); return; }
      setToken(next);
      context.sendCustomMessage(CAST_NAMESPACE, event.senderId, { type: "accepted" });
    };
    context.addCustomMessageListener(CAST_NAMESPACE, listener);
    if (!started.current) {
      try {
        context.start({ disableIdleTimeout: true, statusText: "DuoRally TV board", customNamespaces: { [CAST_NAMESPACE]: framework?.system?.MessageType.JSON ?? "JSON" } });
        started.current = true;
      } catch { setError("Launch DuoRally using a compatible Google Cast sender."); }
    }
    return () => context.removeCustomMessageListener(CAST_NAMESPACE, listener);
  }, [ready]);
  return <div className={styles.pairScreen}>
    <Script src="https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js" strategy="afterInteractive" onReady={() => setReady(true)} onError={() => setError("Google Cast could not load. Check the TV’s internet connection.")} />
    {token ? <TokenTv key={token} token={token} /> : <div className={styles.pairInstructions}><h1>DuoRally</h1><p role="status">{error || "Ready for your session. Choose Cast from DuoRally on your phone or computer."}</p></div>}
  </div>;
}
