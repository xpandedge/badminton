import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";
import s from "./story.module.css";
export function StoryNav() {
  return <nav className={s.nav} aria-label="DuoRally public navigation"><Link href="/" aria-label="DuoRally home"><Logo variant="full" theme="light" size={44} showKicker={false} prominent /></Link><div><Link href="/#how-it-works">How it works</Link><Link href="/demo">Try a demo</Link><Link href="/sign-in">Sign in <span aria-hidden="true">↗</span></Link></div></nav>;
}
export function StoryFooter() {
  return <footer className={s.footer}><span>© {new Date().getFullYear()} DuoRally · Xpandedge Pty Ltd</span><LegalLinks compact /></footer>;
}
export function SampleResults() {
  return <div className={s.results}><span className={s.eyebrow}>Example session results</span><table><caption className={s.resultsCaption}>A little friendly competition.</caption><thead><tr><th scope="col">Player</th><th scope="col">Games</th><th scope="col">Wins</th><th scope="col">+/−</th></tr></thead><tbody>{[["Mia", 4, 3, "+12"], ["Priya", 4, 3, "+8"], ["Leo", 4, 2, "+2"]].map(row => <tr key={row[0]}>{row.map((cell, i) => i === 0 ? <th scope="row" key={i}>{cell}</th> : <td key={i}>{cell}</td>)}</tr>)}</tbody></table><p className={s.sampleNote}>Illustrative results from a separate sample session.</p></div>;
}
