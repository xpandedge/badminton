import Link from "next/link";
import s from "./landing.module.css";

export function OfferSection() {
  return <section className={s.offer} aria-labelledby="offer-title"><div><span className={s.eyebrow}>Start where you are</span><h2 id="offer-title">See the rhythm before you run the night.</h2><p>Explore a sample session, then make your own when your group is ready.</p></div><div className={s.offerActions}><Link className={s.offerPrimary} href="/demo">Try a sample session <span aria-hidden="true">↗</span></Link><Link className={s.offerSecondary} href="/sign-in">Start a real session <span aria-hidden="true">→</span></Link></div></section>;
}
