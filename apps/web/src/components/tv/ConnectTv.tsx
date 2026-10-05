"use client";
import Script from "next/script";
import { useEffect, useState } from "react";
import { claimTvPairing, createCastDisplay } from "@/server/tv/actions";
import { CAST_NAMESPACE } from "@/lib/tv/connection";
import type { CastWindow } from "@/lib/tv/cast-sdk";
import styles from "./tv.module.css";

export function ConnectTv({ boardCode, receiverId }: { boardCode: string; receiverId: string }) {
  const [pairCode, setPairCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [castReady, setCastReady] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (!receiverId) return;
    const win = window as CastWindow;
    const previous = win.__onGCastApiAvailable;
    const initialize = (available: boolean) => {
      const context = win.cast?.framework?.CastContext?.getInstance();
      if (!available || !context) return;
      context.setOptions({ receiverApplicationId: receiverId, autoJoinPolicy: "origin_scoped" });
      setCastReady(true);
    };
    win.__onGCastApiAvailable = initialize;
    if (win.cast?.framework?.CastContext) initialize(true);
    return () => { win.__onGCastApiAvailable = previous; };
  }, [receiverId]);
  async function pair(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setSignIn(false);
    try {
      const result = await claimTvPairing(boardCode, pairCode);
      setMessage(result.ok ? "TV connected. Your session will appear shortly." : result.message);
      if (!result.ok) setSignIn(result.code === "UNAUTHENTICATED");
    } catch { setMessage("Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  async function cast() {
    setBusy(true); setMessage(""); setSignIn(false);
    try {
      const context = (window as CastWindow).cast?.framework?.CastContext?.getInstance();
      if (!context) throw new Error("unsupported");
      // Device selection stays directly attached to the user gesture.
      await context.requestSession();
      const result = await createCastDisplay(boardCode);
      if (!result.ok) { setMessage(result.message); setSignIn(result.code === "UNAUTHENTICATED"); return; }
      const session = context.getCurrentSession();
      if (!session) throw new Error("disconnected");
      await session.sendMessage(CAST_NAMESPACE, { type: "display", token: result.data.token });
      setMessage("Session sent to the TV. Check that your board appears.");
    } catch { setMessage("Casting was cancelled or could not connect. Try again, or use TV browser pairing."); }
    finally { setBusy(false); }
  }
  return <main className={styles.connect}>
    {receiverId && <Script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1" strategy="afterInteractive" />}
    <a href={`/board/${encodeURIComponent(boardCode)}`}>← Back to board</a>
    <h1>Show your social on TV</h1><p>Keep organising from your phone while the TV shows court assignments.</p>
    <section><h2>Connect a TV browser</h2><p>Open <a href="/tv">{origin}/tv</a> on the TV, then enter its pairing code here.</p>
      <form onSubmit={pair}><label htmlFor="tv-pair-code">TV pairing code</label><input id="tv-pair-code" autoComplete="off" autoCapitalize="characters" placeholder="AB12–CD34" value={pairCode} onChange={e => setPairCode(e.target.value)} maxLength={12} required /><button disabled={busy} type="submit">Connect TV</button></form>
    </section>
    <section><h2>Google Cast</h2><p>Select a Chromecast or TV with Google Cast on the same Wi-Fi network.</p>
      {receiverId ? <><button disabled={busy || !castReady} onClick={cast}>Choose a TV</button>{!castReady && <p>Cast is not available in this browser yet. Try supported Chrome, or use TV browser pairing. iPhone browsers do not support this web Cast button.</p>}</> : <p>Google Cast setup is not enabled yet. TV browser pairing is available above.</p>}
    </section>
    <section><h2>Mirror your screen</h2><p>Open the <a href={`/board/${encodeURIComponent(boardCode)}/tv`}>TV board</a> in landscape, then use your phone’s supported mirroring option. Keep that screen open; switching apps can change what the TV shows.</p></section>
    <p role="status">{message}</p>{signIn && <a href="/sign-in">Sign in, then return here to connect</a>}
  </main>;
}
