import type { Metadata } from "next";
import { LegalPage, type LegalSectionLink } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms that apply when organisers and players use DuoRally.",
  alternates: { canonical: "/terms" },
};

const sections: LegalSectionLink[] = [
  { id: "agreement", label: "Agreement" },
  { id: "service", label: "The service" },
  { id: "accounts", label: "Accounts" },
  { id: "groups", label: "Squads and roles" },
  { id: "organisers", label: "Organiser duties" },
  { id: "players", label: "Player safety" },
  { id: "scheduling", label: "Scheduling and scores" },
  { id: "content", label: "Your content" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "availability", label: "Availability" },
  { id: "termination", label: "Suspension and ending use" },
  { id: "consumer-law", label: "Consumer rights" },
  { id: "liability", label: "Liability" },
  { id: "changes", label: "Changes" },
  { id: "law", label: "Governing law" },
  { id: "contact", label: "Contact" },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Using DuoRally"
      title="Terms of Use"
      summary="The practical rules that apply when organisers and players use DuoRally."
      currentPath="/terms"
      sections={sections}
    >
      <section id="agreement">
        <h2>Agreement</h2>
        <p>
          These Terms form an agreement between you and Xpandedge Pty Ltd, the operator of DuoRally. By creating an
          account, signing in, joining a session or otherwise using DuoRally, you agree to these Terms and acknowledge our
          <a href="/privacy"> Privacy Policy</a>.
        </p>
        <p>
          If you use DuoRally for a squad or organisation, you confirm that you have authority to do so. If you do not agree
          to these Terms, do not use the service.
        </p>
      </section>

      <section id="service">
        <h2>The service</h2>
        <p>
          DuoRally helps social racquet sport squads organise members, venues, courts, sessions, match rotations,
          scores and leaderboards for sports such as tennis, badminton, pickleball, squash, table tennis and similar
          court games. It is an organisational tool; Xpandedge does not operate your venue, employ your organiser,
          supervise play or run the underlying sporting activity.
        </p>
        <p>
          DuoRally is currently offered without charge. If paid features are introduced, applicable pricing and additional
          terms will be shown before a purchase or paid commitment is made.
        </p>
      </section>

      <section id="accounts">
        <h2>Accounts and eligibility</h2>
        <p>
          You must provide accurate information, keep your sign-in credentials secure and tell us promptly if you suspect
          unauthorised access. You are responsible for activity performed through your account unless caused by our breach
          of law or failure to use due care and skill.
        </p>
        <p>
          A person under 18 may use DuoRally only with a parent or guardian&apos;s consent and appropriate adult supervision.
          You must not create an account using another person&apos;s identity or share access in a way that defeats squad roles
          and permissions.
        </p>
      </section>

      <section id="groups">
        <h2>Squads and roles</h2>
        <p>DuoRally squads use role-based permissions:</p>
        <ul>
          <li><strong>Owners</strong> control the squad and can appoint or remove Admins.</li>
          <li><strong>Admins</strong> can manage members, venues, courts and sessions within the permissions shown in the service.</li>
          <li><strong>Members</strong> can participate, RSVP, view permitted information and enter scores where enabled.</li>
        </ul>
        <p>
          A role describes access inside DuoRally. It does not make Xpandedge responsible for the organiser&apos;s conduct,
          venue arrangements, participant relationships or sporting decisions.
        </p>
      </section>

      <section id="organisers">
        <h2>Organiser responsibilities</h2>
        <p>Owners and Admins are responsible for:</p>
        <ul>
          <li>having authority to add members and guest-player details</li>
          <li>keeping group, venue, court and session information reasonably accurate</li>
          <li>communicating session details and changes to participants</li>
          <li>reviewing match assignments and correcting scores or player status when needed</li>
          <li>making safe decisions when a player, court, venue or situation changes</li>
          <li>using public board, score and invite links carefully</li>
        </ul>
        <p>
          Organisers should not add sensitive or unnecessary personal information to player names, session names or other
          free-text fields.
        </p>
      </section>

      <section id="players">
        <h2>Player safety and participation</h2>
        <p>
          Sport involves physical risk. Each player is responsible for deciding whether they are fit to participate,
          warming up appropriately, using suitable equipment and following venue rules and reasonable organiser directions.
        </p>
        <p>
          DuoRally does not provide medical, injury, coaching, venue-safety or emergency advice. If someone is injured or a
          situation is unsafe, stop play and seek appropriate assistance. Do not rely on the service to contact emergency
          services or monitor participant wellbeing.
        </p>
      </section>

      <section id="scheduling">
        <h2>Scheduling, fairness and scores</h2>
        <p>
          DuoRally&apos;s generator aims to distribute play fairly using the players, courts, duration, history and optional
          skill information available to it. It does not guarantee identical playing time, perfectly balanced teams, exact
          match duration or avoidance of every repeated partner or opponent.
        </p>
        <p>
          Organisers remain responsible for reviewing upcoming games and using the available controls when attendance,
          courts or conditions change. Scores and statistics depend on information entered by users and may be corrected
          when errors are found.
        </p>
      </section>

      <section id="content">
        <h2>Your content and DuoRally&apos;s materials</h2>
        <p>
          You retain ownership of information and content you submit. You give Xpandedge a non-exclusive, worldwide licence
          to host, store, process, reproduce and display that content only as reasonably needed to operate, secure, support
          and improve DuoRally. This licence ends when the content is deleted, subject to reasonable backup, audit and legal
          retention.
        </p>
        <p>
          Xpandedge owns DuoRally&apos;s software, branding, interface and original materials. These Terms do not transfer our
          intellectual property to you. You may use the service only for its intended personal, social, club or internal
          organisational purposes.
        </p>
      </section>

      <section id="acceptable-use">
        <h2>Acceptable use</h2>
        <p>You must not:</p>
        <ul>
          <li>use DuoRally unlawfully, fraudulently or to harass another person</li>
          <li>impersonate someone or enter personal information without authority</li>
          <li>attempt to access accounts, groups, sessions or systems without permission</li>
          <li>interfere with the service, introduce malicious code or bypass security controls</li>
          <li>scrape, copy or systematically extract data except through features we provide</li>
          <li>use public or invite links to expose, collect or misuse another person&apos;s information</li>
          <li>reverse engineer the service except where applicable law permits it</li>
        </ul>
      </section>

      <section id="availability">
        <h2>Availability and third-party services</h2>
        <p>
          We work to keep DuoRally available and accurate, but internet services can experience maintenance, delay, data
          conflicts or interruption. Keep participants informed and use reasonable backup arrangements when a session is
          operationally important.
        </p>
        <p>
          DuoRally relies on providers including Google, Firebase and Vercel. Their services may be governed by their own
          terms and experience events outside our reasonable control.
        </p>
      </section>

      <section id="termination">
        <h2>Suspension and ending use</h2>
        <p>
          You may stop using DuoRally at any time and may ask us to delete your account. Group Owners and Admins may remove
          members or cancel sessions within their permissions.
        </p>
        <p>
          We may restrict or suspend access where reasonably necessary to protect users or the service, investigate misuse,
          comply with law, address a serious or repeated breach, or prevent harm. Where practical, we will explain the
          reason and provide a reasonable opportunity to respond.
        </p>
      </section>

      <section id="consumer-law">
        <h2>Australian Consumer Law</h2>
        <div className="pb-legal-note">
          <p>
            Nothing in these Terms excludes, restricts or modifies any consumer guarantee, right or remedy under the
            Australian Consumer Law or other law that cannot lawfully be excluded, restricted or modified.
          </p>
        </div>
        <p>
          Where a guarantee applies, services must be provided with due care and skill, be reasonably fit for a disclosed
          purpose where the law requires, and be supplied within a reasonable time where no time is fixed.
        </p>
      </section>

      <section id="liability">
        <h2>Responsibility and liability</h2>
        <p>
          To the extent permitted by law, Xpandedge is not responsible for sports injuries, participant conduct, venue or
          court conditions, organiser decisions, inaccurate information entered by users, or losses caused by using a public
          or invite link contrary to these Terms.
        </p>
        <p>
          To the extent permitted by law, Xpandedge is not liable for indirect or consequential loss that was not reasonably
          foreseeable. Any permitted limitation applies only to the extent it is fair and lawful and does not limit our
          responsibility for fraud, wilful misconduct, or a consumer right that cannot be excluded.
        </p>
      </section>

      <section id="changes">
        <h2>Changes to DuoRally or these Terms</h2>
        <p>
          We may improve, replace or withdraw features. We may also update these Terms to reflect product, provider or legal
          changes. Material changes will receive reasonable notice where practical and will apply prospectively. If you do
          not agree to updated Terms, you may stop using the service.
        </p>
      </section>

      <section id="law">
        <h2>Governing law</h2>
        <p>
          These Terms are governed by the laws of Queensland, Australia, subject to any mandatory law that applies in your
          location. You and Xpandedge submit to the courts of Queensland and courts entitled to hear appeals from them.
        </p>
      </section>

      <section id="contact">
        <h2>Contact and complaints</h2>
        <p>
          Send questions or complaints about DuoRally or these Terms to{" "}
          <a href="mailto:contact@xpandedge.com.au">contact@xpandedge.com.au</a>. Include enough detail for us to understand
          the issue and the outcome you are seeking.
        </p>
      </section>
    </LegalPage>
  );
}
