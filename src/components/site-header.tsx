import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const navigation = [
  { href: "/workflows/ugc-video", label: "How it works" },
  { href: "/product-truth", label: "Product truth" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="site-brand" href="/" aria-label="Vixel UGC Studio home">
        <span className="site-brand-mark" aria-hidden="true">
          VX
        </span>
        <span className="site-brand-word">Vixel <em>UGC</em></span>
      </Link>

      <nav className="desktop-navigation" aria-label="Primary navigation">
        {navigation.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="header-actions">
        <Link className="header-login" href="/studio">
          Log in
        </Link>
        <Link className="header-cta" href="/waitlist">
          Join beta
          <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.8} />
        </Link>
      </div>

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
          <Link href="/studio">Log in</Link>
          <Link href="/waitlist">Join beta ↗</Link>
        </nav>
      </details>
    </header>
  );
}
