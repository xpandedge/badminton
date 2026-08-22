# Privacy and Terms Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish public, mobile-friendly DuoRally Privacy Policy and Terms of Use pages grounded in Australian law and linked from the product's public and Help surfaces.

**Architecture:** Add two static App Router pages that share a focused legal-document shell and reusable legal-link navigation. Keep the legal copy in the route files so each document remains readable and independently editable, while shared responsive presentation lives in `LegalPage.tsx`, `LegalLinks.tsx`, and `globals.css`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, existing DuoRally CSS variables, Vitest/TypeScript verification, Playwright responsive smoke tests.

## Global Constraints

- The operator and contracting party is `Xpandedge Pty Ltd`.
- Privacy and legal enquiries use `contact@xpandedge.com.au`.
- Privacy route is exactly `/privacy`; Terms route is exactly `/terms`.
- Both pages are public and must not depend on authentication or Firebase.
- Display `Last updated: 9 August 2026` on both pages.
- Privacy wording must follow the Privacy Act 1988 (Cth) and Australian Privacy Principles where applicable.
- Marketing wording must follow the Spam Act 2003 (Cth): consent, sender identification, contact details, and a functional unsubscribe method.
- Terms must preserve rights that cannot be excluded under the Australian Consumer Law.
- Queensland is the governing jurisdiction, subject to mandatory applicable law.
- Do not publish a legal-review, legal-advice, or template disclaimer.
- Do not add a cookie banner: DuoRally does not currently expose optional advertising-cookie controls.
- Do not add a new dependency or visual design system.
- Keep source edits ASCII unless an existing file already requires otherwise.

## File Map

- Create `apps/web/src/components/LegalLinks.tsx`: reusable Privacy/Terms links for public and authenticated surfaces.
- Create `apps/web/src/components/LegalPage.tsx`: shared public legal-document header, section navigation, content and footer shell.
- Create `apps/web/src/app/privacy/page.tsx`: Privacy Policy metadata and full policy content.
- Create `apps/web/src/app/terms/page.tsx`: Terms metadata and full terms content.
- Create `apps/web/e2e/legal.spec.ts`: public-route, entry-link and responsive-overflow checks.
- Modify `apps/web/src/app/globals.css`: legal document, navigation and consent-copy styles.
- Modify `apps/web/src/app/page.tsx`: landing-page legal links.
- Modify `apps/web/src/app/sign-in/page.tsx`: acceptance wording and legal links.
- Modify `apps/web/src/app/(app)/help/page.tsx`: legal links for signed-in users.

---

### Task 1: Shared Legal Navigation and Document Shell

**Files:**
- Create: `apps/web/src/components/LegalLinks.tsx`
- Create: `apps/web/src/components/LegalPage.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Produces: `LegalLinks({ className?, compact? }): JSX.Element`
- Produces: `LegalPage({ eyebrow, title, summary, currentPath, sections, children }): JSX.Element`
- Consumes: existing `Logo`, `next/link`, and global DuoRally design tokens.

- [ ] **Step 1: Create the reusable legal links**

```tsx
import Link from "next/link";

export function LegalLinks({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <nav className={`pb-legal-links ${className}`.trim()} data-compact={compact || undefined} aria-label="Legal">
      <Link href="/privacy">Privacy</Link>
      <span aria-hidden="true">/</span>
      <Link href="/terms">Terms</Link>
    </nav>
  );
}
```

- [ ] **Step 2: Create the shared legal page shell**

Define this exact prop contract:

```tsx
type LegalSectionLink = { id: string; label: string };

type LegalPageProps = {
  eyebrow: string;
  title: string;
  summary: string;
  currentPath: "/privacy" | "/terms";
  sections: LegalSectionLink[];
  children: React.ReactNode;
};
```

The rendered structure must contain:

```tsx
<div className="pb-legal-page">
  <header className="pb-legal-topbar">...</header>
  <main className="pb-legal-main">
    <header className="pb-legal-hero">...</header>
    <div className="pb-legal-layout">
      <aside className="pb-legal-toc" aria-label={`${title} sections`}>...</aside>
      <article className="pb-legal-document">{children}</article>
    </div>
  </main>
  <footer className="pb-legal-footer">...</footer>
</div>
```

The top bar links the DuoRally logo to `/`, includes a `Back to DuoRally` link, and uses `LegalLinks`. The table of contents marks the current page route and links section IDs without client state.

- [ ] **Step 3: Add responsive legal-page CSS**

Add styles with these layout requirements:

```css
.pb-legal-main { width: min(1120px, 100%); margin: 0 auto; padding: 1.25rem; }
.pb-legal-layout { display: grid; grid-template-columns: 220px minmax(0, 720px); gap: 3rem; align-items: start; }
.pb-legal-toc { position: sticky; top: 84px; }
.pb-legal-document section { scroll-margin-top: 84px; padding: 0 0 2rem; }
.pb-legal-document h2 { font-family: var(--font-display-tight); letter-spacing: 0; }
.pb-legal-document p,
.pb-legal-document li { max-width: 72ch; line-height: 1.68; }
```

At `max-width: 760px`, switch `.pb-legal-layout` to one column, make the table of contents a horizontally scrollable section index, and remove sticky positioning. All links must have visible focus and hover states. Add print rules that hide the top bar, section index and footer while rendering the document in black on white.

- [ ] **Step 4: Run TypeScript to catch shell interface errors**

Run from `apps/web`:

```powershell
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: PASS with no TypeScript diagnostics.

- [ ] **Step 5: Commit the shared shell**

```powershell
git add apps/web/src/components/LegalLinks.tsx apps/web/src/components/LegalPage.tsx apps/web/src/app/globals.css
git commit -m "Add shared legal page layout" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Privacy Policy Route

**Files:**
- Create: `apps/web/src/app/privacy/page.tsx`

**Interfaces:**
- Consumes: `LegalPage` from `@/components/LegalPage`.
- Produces: public static route `/privacy` and page metadata.

- [ ] **Step 1: Define metadata and section navigation**

Export metadata with title `Privacy Policy | DuoRally` and description `How Xpandedge Pty Ltd collects, uses, stores and protects personal information when you use DuoRally.`

Use these section IDs in this order:

```ts
const sections = [
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
```

- [ ] **Step 2: Write the policy content**

The page must make these exact operational commitments:

- Xpandedge Pty Ltd operates DuoRally and handles personal information in accordance with the Privacy Act 1988 (Cth) and APPs where they apply.
- Collected data includes account/profile data; group roles; guest names and skill levels; RSVPs and attendance; match assignments, scores and statistics; venue/court/session details; support messages; and technical/usage information.
- Collection occurs directly from users, from organisers entering guest details, automatically through Firebase/Analytics and device storage, and through public/share-link activity.
- Purposes include authentication, group/session operation, match generation and fairness, live scoring, leaderboards, support, security, debugging and aggregate product improvement.
- Match generation uses player availability, playing history and skill inputs to suggest future games; organisers can change players, courts and upcoming games.
- Group members can see group/session information. Anyone with a public board or score link may see the names, courts, matches and scores exposed by that link.
- Processors include Google/Firebase and Vercel. Information may be processed outside Australia, including in the United States and United Kingdom, and other locations where providers operate.
- Security uses reasonable technical and organisational measures but does not promise absolute security.
- Retention lasts while reasonably needed for service operation, records, disputes, security and legal obligations. Deletion requests may be subject to legitimate retention and backup cycles.
- Users may request access, correction or deletion at `contact@xpandedge.com.au`; identity may be verified before release or change.
- Service communications are distinct from marketing. Marketing requires consent or another lawful basis and includes sender/contact details and an unsubscribe method honoured within five working days.
- Organisers must have authority to enter another person's details, particularly a minor's details. DuoRally is not designed for unsupervised use by children.
- Privacy complaints go first to Xpandedge, with an aim to respond within 30 days, then may be taken to the OAIC.
- Eligible data breaches will be assessed and notified as required by the Notifiable Data Breaches scheme where it applies.

Include official links to the OAIC privacy complaint page and the Australian Privacy Principles. Do not add a legal disclaimer.

- [ ] **Step 3: Verify the route compiles**

Run from `apps/web`:

```powershell
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit the Privacy Policy**

```powershell
git add apps/web/src/app/privacy/page.tsx
git commit -m "Add DuoRally privacy policy" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Terms of Use Route

**Files:**
- Create: `apps/web/src/app/terms/page.tsx`

**Interfaces:**
- Consumes: `LegalPage` from `@/components/LegalPage`.
- Produces: public static route `/terms` and page metadata.

- [ ] **Step 1: Define metadata and section navigation**

Export metadata with title `Terms of Use | DuoRally` and description `The terms that apply when organisers and players use DuoRally.`

Use these section IDs in this order:

```ts
const sections = [
  { id: "agreement", label: "Agreement" },
  { id: "service", label: "The service" },
  { id: "accounts", label: "Accounts" },
  { id: "groups", label: "Groups and roles" },
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
```

- [ ] **Step 2: Write the Terms content**

The Terms must state:

- Using DuoRally or creating an account forms an agreement with Xpandedge Pty Ltd.
- A person under 18 may use DuoRally only with parent/guardian consent and appropriate adult supervision.
- Users must protect account credentials, provide accurate information and notify Xpandedge of suspected unauthorised access.
- Owners and Admins control group operations; Members may participate, RSVP and score within their permissions. Role labels do not make Xpandedge an organiser of the underlying sports activity.
- Organisers are responsible for permission to enter guest details, appropriate court/venue setup, participant communication, score corrections and safe operational decisions.
- Players decide whether they are fit to participate and must follow venue rules and reasonable organiser directions. DuoRally does not provide medical, injury, coaching, venue-safety or emergency advice.
- The generator aims for fair rotations using available inputs but does not guarantee identical play time, perfectly balanced teams or avoidance of every repeat.
- Users retain ownership of submitted content and grant Xpandedge a non-exclusive licence only to host, process, reproduce and display it as needed to operate, secure and improve DuoRally.
- Prohibited behaviour includes unlawful use, harassment, impersonation, unauthorised access, interference, malicious code, scraping, privacy infringement and entering information without authority.
- The service may change, experience interruptions or withdraw features. Material Terms changes receive reasonable notice where practical and apply prospectively.
- Xpandedge may suspend access to protect users/service or address serious/repeated breaches, and users may stop using the service at any time.
- Nothing excludes, restricts or modifies Australian Consumer Law rights that cannot lawfully be excluded.
- To the extent permitted by law, Xpandedge is not responsible for sports injuries, venue conditions, organiser/player decisions, inaccurate user-entered information, or indirect/consequential loss. Any permitted limitation must not purport to exclude due care and skill or other non-excludable guarantees.
- Queensland law governs, subject to mandatory applicable law, and the parties submit to Queensland courts.
- Questions and complaints use `contact@xpandedge.com.au`.

Avoid indemnities, unilateral retroactive changes, blanket warranties, or statements that all liability is excluded.

- [ ] **Step 3: Verify the route compiles**

Run from `apps/web`:

```powershell
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit the Terms**

```powershell
git add apps/web/src/app/terms/page.tsx
git commit -m "Add DuoRally terms of use" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Product Entry Links and Acceptance Copy

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/sign-in/page.tsx`
- Modify: `apps/web/src/app/(app)/help/page.tsx`

**Interfaces:**
- Consumes: `LegalLinks` from `@/components/LegalLinks`.
- Produces: discoverable legal links and transparent account-entry wording.

- [ ] **Step 1: Add landing-page legal links**

Import `LegalLinks` and render `<LegalLinks compact />` below the existing `Plan games / run courts / track scores` line. Keep it visually secondary.

- [ ] **Step 2: Add sign-in acceptance wording**

Below the sign-in/register mode toggle, add this exact copy with inline links:

```tsx
<p className="pb-legal-consent">
  By signing in or creating an account, you agree to the <Link href="/terms">Terms</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>.
</p>
```

This applies to Google and email authentication without adding a preselected marketing-consent checkbox.

- [ ] **Step 3: Add Help-page legal links**

Render a quiet footer section after Troubleshooting:

```tsx
<footer className="pb-help-legal">
  <span>Xpandedge Pty Ltd</span>
  <LegalLinks compact />
</footer>
```

- [ ] **Step 4: Run TypeScript**

Run from `apps/web`:

```powershell
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit product links**

```powershell
git add apps/web/src/app/page.tsx apps/web/src/app/sign-in/page.tsx "apps/web/src/app/(app)/help/page.tsx"
git commit -m "Link DuoRally legal documents" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Public Route and Responsive Verification

**Files:**
- Create: `apps/web/e2e/legal.spec.ts`

**Interfaces:**
- Consumes: `/`, `/sign-in`, `/privacy`, `/terms`.
- Produces: browser regression coverage for public legal access and responsive layout.

- [ ] **Step 1: Write the Playwright checks**

```ts
import { test, expect } from "@playwright/test";

test.describe("public legal pages", () => {
  test("privacy and terms are public and cross-linked", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible();
    await expect(page.getByText("Xpandedge Pty Ltd").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms" }).first()).toHaveAttribute("href", "/terms");

    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "Terms of Use", level: 1 })).toBeVisible();
    await expect(page.getByText("Australian Consumer Law").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy" }).first()).toHaveAttribute("href", "/privacy");
  });

  test("entry surfaces expose legal links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await page.goto("/sign-in");
    await expect(page.getByText(/agree to the Terms/)).toBeVisible();
  });

  test("legal pages do not overflow a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/privacy");
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);
  });
});
```

- [ ] **Step 2: Run focused browser tests**

Run from `apps/web` with the local dev server and available browser runtime:

```powershell
.\node_modules\.bin\playwright.CMD test e2e/legal.spec.ts
```

Expected: 3 tests pass. If the bundled Playwright browser is unavailable, run the same assertions through the configured in-app browser and record that substitution.

- [ ] **Step 3: Run unit tests**

Run from `apps/web`:

```powershell
.\node_modules\.bin\vitest.CMD run
```

Expected: all existing web unit tests pass.

- [ ] **Step 4: Run production build**

Run from the repository root:

```powershell
pnpm --filter @picklebaddies/web build
```

Expected: `/privacy` and `/terms` appear as static routes and the build exits 0. If the known Windows standalone symlink copy fails after successful compile, typecheck and page generation, retain the complete evidence and rely on the remote Vercel Linux build when deployment is requested.

- [ ] **Step 5: Visually inspect desktop and mobile**

Verify at `1440x900` and `390x844`:

- headings and paragraphs do not overlap
- table of contents is sticky on desktop and scrollable on mobile
- no horizontal page overflow
- landing and sign-in links are legible but secondary
- print preview contains document content without app navigation

- [ ] **Step 6: Commit the verification test**

```powershell
git add apps/web/e2e/legal.spec.ts
git commit -m "Test public legal pages" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Self-Review

- Spec coverage: operator, contact, routes, Australian privacy/consumer/spam law, Queensland jurisdiction, entry links, acceptance copy, metadata, mobile, print and testing all map to tasks above.
- Placeholder scan: no TBD, TODO, deferred implementation instruction or unspecified error-handling step remains.
- Type consistency: `LegalLinks` and `LegalPage` signatures are defined once and consumed with matching names in every later task.
- Scope: no account deletion UI, cookie banner, marketing preference centre, payment terms or unrelated app feature is introduced.
