import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CourtDiagram, Player } from "@/components/demo/CourtDiagram";
import { SessionDemo } from "@/components/demo/SessionDemo";
import { StoryNav, StoryFooter, SampleResults } from "@/components/demo/StoryChrome";
import { DEMO_SNAPSHOTS } from "@/lib/demo/session-demo";
import s from "@/components/demo/story.module.css";
import { PainSection } from "@/components/landing/PainSection";
import { CapabilityStrip } from "@/components/landing/CapabilityStrip";
import { AudienceSection } from "@/components/landing/AudienceSection";
import { OfferSection } from "@/components/landing/OfferSection";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { MobileCta } from "@/components/landing/MobileCta";
export const metadata: Metadata = {
  title: "Fair Player Rotations for Social Court Sessions",
  description: "Less organising. More playing. Run social court sessions with fair player rotations, live courts, scoring and results.",
  alternates: { canonical: "/" },
  openGraph: { title: "DuoRally | Less organising. More playing.", description: "Player rotations, live courts and results for your social court group.", url: "/" },
};
const links = [
  ["/pickleball-rotation-app", "Pickleball"],
  ["/badminton-doubles-rotation-app", "Badminton"],
  ["/racquet-sports-rotation-app", "More court sports"],
  ["/brisbane-pickleball-badminton-court-bookings", "Brisbane courts"],
];
export default function Home() {
  return <main className={s.site}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "DuoRally", applicationCategory: "SportsApplication", operatingSystem: "Web", url: "https://duorally.com.au/", description: "Player rotations, fixed-pair round robins, scoring and live boards for social court sessions." }) }} />
    <StoryNav />
    <section className={s.hero} aria-labelledby="home-title">
      <div className={s.heroCopy}><span className={s.eyebrow}>DuoRally / Your night on court</span><h1 id="home-title">Less organising.<br /><em>More playing.</em></h1><p>Fair player rotations, live courts and results. Everything your social court group needs to keep the night moving.</p><div className={s.actions}><Link className={s.primary} href="/sign-in">Start a session <span aria-hidden="true">↗</span></Link><Link className={s.secondary} href="/demo">Try a sample session <span aria-hidden="true">→</span></Link></div><span className={s.sportsNote}>Pickleball · Badminton · More court sports</span></div>
      <div className={s.heroDiagram}><div className={s.diagramHeading}><span className={s.eyebrow}>A place for every player</span><span className={s.example}>Example session</span></div><CourtDiagram court={DEMO_SNAPSHOTS.playing.courts[0]!} /><div className={s.heroBench}><div className={s.benchPlayers}><Player name="Oli" /><Player name="Chen" /></div><span className={s.rotationArrow} aria-hidden="true">↗</span><p>A breather now.<br /><strong>A new game next.</strong></p></div></div>
    </section>
    <PainSection />
    <section className={s.flow} id="how-it-works" aria-labelledby="flow-title"><div className={s.sectionHeading}><span className={s.eyebrow}>Three steps from invite to results</span><h2 id="flow-title">Three steps. One simple rhythm.</h2></div><div className={s.steps}>
      <article><div className={s.joinVisual} aria-label="Example: Mia, Leo and Priya have joined"><Player name="Mia" /><Player name="Leo" /><Player name="Priya" /><span className={s.joinCheck} aria-hidden="true">✓</span></div><span className={s.stepNumber}>01 / Before play</span><h3>Get your people together.</h3><p>Invite your squad. See who’s coming. Set your courts.</p></article>
      <article><div className={s.rotateVisual} aria-label="Players rotate through playing and resting"><span>On court</span><span aria-hidden="true">⇄</span><span>Take a rest</span></div><span className={s.stepNumber}>02 / During play</span><h3>Give everyone a turn.</h3><p>Mix partners, share court time and keep games moving.</p></article>
      <article><div className={s.scoreVisual} aria-label="Example final score: eleven to seven"><span>11</span><small>FINAL</small><span>7</span></div><span className={s.stepNumber}>03 / After play</span><h3>Keep more than the memories.</h3><p>Enter scores. See the standings. Keep the night’s results.</p></article>
    </div></section>
    <CapabilityStrip />
    <section className={s.rotationSection} aria-labelledby="rotation-title"><div className={s.sectionHeading}><span className={s.eyebrow}>See the rotation</span><h2 id="rotation-title">A court opens.<br />The next game begins.</h2><p>One longer game doesn’t have to hold up the whole group.</p></div><SessionDemo /></section>
    <AudienceSection />
    <section className={s.playerSection} aria-labelledby="player-title"><div className={s.playerCopy}><span className={s.eyebrow}>For every player</span><h2 id="player-title">“Where am I playing?”<br /><em>Right here.</em></h2><p>Share the live board. Players can see their court, their partners and who’s waiting from their own phone.</p><Link className={s.textLink} href="/demo">Explore the sample session <span aria-hidden="true">→</span></Link></div><div className={s.phoneScene}><div className={s.phone}><span className={s.phoneBrand}>duorally <span>LIVE BOARD</span></span><span className={s.eyebrow}>Example player view</span><small>Playing now</small><strong className={s.phoneCourt}>Court 1</strong><div className={s.phoneTeam}><Player name="Mia" /><Player name="Leo" /></div><span className={s.versus}>VS</span><p>Priya + Noah</p><div className={s.phoneWaiting}><span>Waiting & resting</span><strong>Oli · Chen</strong></div></div><span className={s.phoneCaption}>One shared link.<br />Everyone in the picture.</span></div></section>
    <section className={s.resultsSection}><div><span className={s.eyebrow}>A record of the night</span><h2>Last game.<br />Lasting results.</h2><p>Games, wins and scores in one place. Ready for the post-game conversation.</p></div><SampleResults /></section>
    <section className={s.photoSection}><Image src="/duorally-courtside-session.png" alt="Social court players checking their next game together" width={1792} height={1024} sizes="(max-width: 700px) 100vw, 55vw" /><div><span className={s.eyebrow}>Your group. Your way to play.</span><h2>Made for your regular court night.</h2><h3>Social player rotation</h3><p>New partners, different opponents and shared court time.</p><h3>Fixed-pair round robin</h3><p>Keep your team together and play through the matchups.</p><div className={s.sportLinks}>{links.map(([href, label]) => <Link key={href} href={href!}>{label} ↗</Link>)}</div></div></section>
    <OfferSection />
    <LandingFaq />
    <section className={s.final}><span className={s.eyebrow}>Ready when your players are</span><h2>Make room for<br />more playing.</h2><Link className={s.primary} href="/sign-in">Start a session <span aria-hidden="true">↗</span></Link></section><MobileCta /><StoryFooter />
  </main>;
}
