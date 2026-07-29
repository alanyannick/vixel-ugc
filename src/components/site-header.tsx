import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const navigation = [
  { href: "/workflows/koc-video", label: "Workflow" },
  { href: "/product-truth", label: "Product truth" },
  { href: "/pricing", label: "Access" },
  { href: "/faq", label: "FAQ" },
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="site-brand" href="/" aria-label="Vixel KOC Studio home">
        <span className="site-brand-mark" aria-hidden="true">
          VX
        </span>
        <span className="site-brand-word">
          Vixel <em>KOC</em>
        </span>
      </Link>

      <nav className="desktop-navigation" aria-label="Primary navigation">
        {navigation.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>

      <Link className="header-cta" href="/studio">
        Open studio
        <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.8} />
      </Link>

      <details className="mobile-menu">
        <summary aria-label="Open navigation">
          <span />
          <span />
        </summary>
        <nav aria-label="Mobile navigation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
          <Link href="/studio">Open studio ↗</Link>
        </nav>
      </details>
    </header>
  );
}
