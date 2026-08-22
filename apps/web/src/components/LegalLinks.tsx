import Link from "next/link";

export function LegalLinks({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <nav
      className={`pb-legal-links ${className}`.trim()}
      data-compact={compact || undefined}
      aria-label="Legal"
    >
      <Link href="/privacy">Privacy</Link>
      <span aria-hidden="true">/</span>
      <Link href="/terms">Terms</Link>
    </nav>
  );
}
