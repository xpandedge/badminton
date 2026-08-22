import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";

export type LegalSectionLink = {
  id: string;
  label: string;
};

type LegalPageProps = {
  eyebrow: string;
  title: string;
  summary: string;
  currentPath: "/privacy" | "/terms";
  sections: LegalSectionLink[];
  children: React.ReactNode;
};

export function LegalPage({ eyebrow, title, summary, currentPath, sections, children }: LegalPageProps) {
  return (
    <div className="pb-legal-page">
      <header className="pb-legal-topbar">
        <div className="pb-legal-topbar__inner">
          <Link href="/" className="pb-legal-brand" aria-label="DuoRally home">
            <Logo variant="full" theme="light" size={36} />
          </Link>
          <div className="pb-legal-topbar__actions">
            <LegalLinks compact />
            <Link href="/" className="pb-legal-back">Back to DuoRally</Link>
          </div>
        </div>
      </header>

      <main className="pb-legal-main">
        <header className="pb-legal-hero">
          <div className="pb-legal-hero__copy">
            <span className="pb-legal-kicker">{eyebrow}</span>
            <h1>{title}</h1>
            <p>{summary}</p>
          </div>
          <div className="pb-legal-meta">
            <span>Xpandedge Pty Ltd</span>
            <span>Last updated: 9 August 2026</span>
          </div>
        </header>

        <nav className="pb-legal-switch" aria-label="Legal documents">
          <Link href="/privacy" aria-current={currentPath === "/privacy" ? "page" : undefined}>Privacy Policy</Link>
          <Link href="/terms" aria-current={currentPath === "/terms" ? "page" : undefined}>Terms of Use</Link>
        </nav>

        <div className="pb-legal-layout">
          <aside className="pb-legal-toc" aria-label={`${title} sections`}>
            <span className="pb-legal-toc__label">On this page</span>
            <nav>
              {sections.map((section, index) => (
                <a key={section.id} href={`#${section.id}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {section.label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="pb-legal-document">{children}</article>
        </div>
      </main>

      <footer className="pb-legal-footer">
        <div>
          <strong>Xpandedge Pty Ltd</strong>
          <a href="mailto:contact@xpandedge.com.au">contact@xpandedge.com.au</a>
        </div>
        <LegalLinks compact />
      </footer>
    </div>
  );
}
