"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import s from "./landing.module.css";

export function MobileCta() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > Math.min(520, window.innerHeight * 0.7));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return <div className={`${s.mobileCta} ${visible ? s.mobileCtaVisible : ""}`} aria-hidden={!visible}><Link href="/demo">Try a sample session <span aria-hidden="true">↗</span></Link><Link href="/sign-in" className={s.mobileCtaSecondary}>Start yours</Link></div>;
}
