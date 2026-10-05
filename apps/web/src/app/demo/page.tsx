import type { Metadata } from "next";
import Link from "next/link";
import { SessionDemo } from "@/components/demo/SessionDemo";
import { StoryNav, StoryFooter, SampleResults } from "@/components/demo/StoryChrome";
import s from "@/components/demo/story.module.css";
export const metadata: Metadata = { title: "Try a sample session", description: "Explore a fictional DuoRally session. See court rotations, waiting players and sample results without signing in.", alternates: { canonical: "/demo" } };
export default function DemoPage() {
  return <main className={s.site}><StoryNav /><section className={s.demoIntro}><span className={s.eyebrow}>Take a look around</span><h1>Try a sample session</h1><p>No account needed. Choose a moment below to see how the night keeps moving.</p></section><section className={s.demoSection} aria-label="Interactive sample session"><SessionDemo /></section><section className={s.resultsSection}><div><span className={s.eyebrow}>After the last game</span><h2>The results stay with you.</h2><p>Track scores during play and leave with a record of the night.</p></div><SampleResults /></section><section className={s.final}><h2>Your players. Your next session.</h2><Link className={s.primary} href="/sign-in">Start my own session <span aria-hidden="true">↗</span></Link></section><StoryFooter /></main>;
}
