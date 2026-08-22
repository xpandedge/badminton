import type { Metadata } from "next";
import { LegalPage, type LegalSectionLink } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | DuoRally",
  description: "How Xpandedge Pty Ltd collects, uses, stores and protects personal information when you use DuoRally.",
};

const sections: LegalSectionLink[] = [
  { id: "about", label: "About this policy" },
  { id: "information", label: "Information we collect" },
  { id: "collection", label: "How we collect it" },
  { id: "use", label: "How we use it" },
  { id: "sharing", label: "Sharing and visibility" },
  { id: "overseas", label: "Overseas processing" },
  { id: "security", label: "Security and retention" },
  { id: "choices", label: "Access and choices" },
  { id: "marketing", label: "Communications" },
  { id: "children", label: "Children" },
  { id: "complaints", label: "Complaints" },
  { id: "changes", label: "Changes" },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Your information"
      title="Privacy Policy"
      summary="What DuoRally collects, why we need it, who can see it, and the choices you have."
      currentPath="/privacy"
      sections={sections}
    >
      <section id="about">
        <h2>About this policy</h2>
        <p>
          Xpandedge Pty Ltd operates DuoRally. This policy explains how we handle personal information under the
          Privacy Act 1988 (Cth) and the Australian Privacy Principles where they apply.
        </p>
        <p>
          Questions about this policy or your information can be sent to{" "}
          <a href="mailto:contact@xpandedge.com.au">contact@xpandedge.com.au</a>.
        </p>
      </section>

      <section id="information">
        <h2>Information we collect</h2>
        <p>We collect the information needed to create accounts, organise groups and run racquet-sport sessions.</p>
        <ul>
          <li><strong>Account information:</strong> name, email address, profile details, authentication identifier and account status.</li>
          <li><strong>Group information:</strong> squad membership, invitations, join requests and Owner, Admin or Member roles.</li>
          <li><strong>Player information:</strong> display name, skill level, availability, RSVP and attendance status. Organisers may add name-only guests.</li>
          <li><strong>Play information:</strong> match assignments, partners, opponents, sit-outs, scores, results, statistics and leaderboard positions.</li>
          <li><strong>Session information:</strong> sport, venue, courts, dates, duration, settings and organiser actions.</li>
          <li><strong>Technical information:</strong> device and browser information, IP address, authentication/session data, diagnostics, security events and product usage.</li>
          <li><strong>Communications:</strong> information you provide when you contact us for support, access, correction or a complaint.</li>
        </ul>
        <p>We do not sell personal information.</p>
      </section>

      <section id="collection">
        <h2>How we collect information</h2>
        <p>We collect information directly when you create an account, join a squad, RSVP, enter a score or contact us.</p>
        <p>
          We also receive information from organisers who add members or guest players, from authentication providers
          you choose to use, and automatically through Firebase, analytics, application logs, cookies and local device storage.
          Local storage may remember preferences or a public player-board selection on that device.
        </p>
        <p>
          If you provide another person&apos;s details, you must have their authority and make them aware that DuoRally will
          use those details to organise and record the session.
        </p>
      </section>

      <section id="use">
        <h2>How we use information</h2>
        <ul>
          <li>authenticate users and maintain accounts</li>
          <li>create and administer squads, roles, invitations and sessions</li>
          <li>generate court assignments, rotations and future games</li>
          <li>record scores, calculate results and display leaderboards</li>
          <li>keep public player boards and score links updated</li>
          <li>provide support, investigate problems and prevent misuse</li>
          <li>secure, maintain and improve DuoRally</li>
          <li>produce aggregated product insights that do not reasonably identify an individual</li>
          <li>comply with legal obligations and resolve disputes</li>
        </ul>
        <div className="pb-legal-note">
          <strong>How match generation works</strong>
          <p>
            DuoRally uses availability, previous assignments and optional skill information to suggest upcoming games.
            Organisers can change players, courts and future assignments. The generator does not make decisions about a
            person&apos;s eligibility, employment, credit, health care or other legal rights.
          </p>
        </div>
      </section>

      <section id="sharing">
        <h2>Sharing and visibility</h2>
        <p>Information is shared only where needed to operate DuoRally, provide the feature you requested or comply with law.</p>
        <ul>
          <li><strong>Squad members:</strong> members can see relevant squad, session, player and result information.</li>
          <li><strong>Public links:</strong> anyone with a player-board or score link may see names, courts, match assignments and scores made available through that link.</li>
          <li><strong>Service providers:</strong> Google and Firebase provide authentication, database, analytics and infrastructure services; Vercel provides hosting and application infrastructure.</li>
          <li><strong>Professional and legal recipients:</strong> information may be disclosed to advisers, regulators, courts or law-enforcement bodies where reasonably necessary or legally required.</li>
          <li><strong>Business changes:</strong> information may be transferred as part of a genuine sale, restructure or transfer of DuoRally, subject to appropriate confidentiality and privacy protections.</li>
        </ul>
      </section>

      <section id="overseas">
        <h2>Overseas processing</h2>
        <p>
          DuoRally uses cloud providers with operations outside Australia. Personal information may be stored or processed
          in the United States, the United Kingdom and other locations where Google, Firebase, Vercel or their approved
          service providers operate.
        </p>
        <p>
          Where the Australian Privacy Principles apply, we take reasonable steps in relation to overseas handling as
          required by APP 8. Provider locations and infrastructure can change; contact us for current information relevant
          to your request.
        </p>
      </section>

      <section id="security">
        <h2>Security, retention and data breaches</h2>
        <p>
          We use reasonable technical and organisational safeguards designed to protect personal information from loss,
          misuse, interference and unauthorised access, modification or disclosure. No internet service can guarantee
          absolute security.
        </p>
        <p>
          We retain information while it is reasonably needed to operate DuoRally, maintain playing records, secure the
          service, resolve disputes and meet legal obligations. Information may remain for a limited period in backups and
          audit records after it is removed from active use.
        </p>
        <p>
          We assess suspected data breaches and, where the Notifiable Data Breaches scheme applies, notify affected people
          and the Office of the Australian Information Commissioner when an eligible breach is likely to cause serious harm.
        </p>
      </section>

      <section id="choices">
        <h2>Access, correction and deletion</h2>
        <p>
          You can ask to access or correct personal information we hold about you, or request deletion of your account and
          associated information, by emailing <a href="mailto:contact@xpandedge.com.au">contact@xpandedge.com.au</a>.
          We may verify your identity before acting on a request.
        </p>
        <p>
          We will respond within a reasonable period. Some information may need to be retained for security, legal,
          dispute-resolution or legitimate recordkeeping purposes. If we cannot complete a request, we will explain why
          where required and tell you about available complaint options.
        </p>
      </section>

      <section id="marketing">
        <h2>Service and marketing communications</h2>
        <p>
          We may send operational messages needed for your account, security or sessions. These are service communications,
          not marketing.
        </p>
        <p>
          We will send commercial electronic messages only with your consent or where otherwise permitted by the Spam Act
          2003 (Cth). Those messages will identify the sender, include contact details and provide a working unsubscribe
          method. We will action unsubscribe requests within five working days.
        </p>
      </section>

      <section id="children">
        <h2>Children and young players</h2>
        <p>
          DuoRally is not designed for unsupervised use by children. A parent, guardian or responsible organiser should
          supervise use by a person under 18. Organisers must not enter a minor&apos;s personal information without appropriate
          parent or guardian authority.
        </p>
      </section>

      <section id="complaints">
        <h2>Privacy questions and complaints</h2>
        <p>
          Email <a href="mailto:contact@xpandedge.com.au">contact@xpandedge.com.au</a> with enough detail for us to
          understand and investigate your concern. We aim to acknowledge complaints promptly and respond within 30 days.
        </p>
        <p>
          If you are not satisfied with our response, you may contact the{" "}
          <a href="https://www.oaic.gov.au/privacy/privacy-complaints" target="_blank" rel="noreferrer">
            Office of the Australian Information Commissioner
          </a>. You can also read the{" "}
          <a href="https://www.oaic.gov.au/privacy/australian-privacy-principles" target="_blank" rel="noreferrer">
            Australian Privacy Principles
          </a>.
        </p>
      </section>

      <section id="changes">
        <h2>Changes to this policy</h2>
        <p>
          We may update this policy when DuoRally, our providers or legal obligations change. The current version will be
          published here with an updated date. We will provide reasonable notice in the service when a change materially
          affects how we handle personal information.
        </p>
      </section>
    </LegalPage>
  );
}
