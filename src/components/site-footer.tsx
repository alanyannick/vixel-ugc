import Link from "next/link";

const productLinks = [
  { href: "/workflows/koc-video", label: "KOC workflow" },
  { href: "/product-truth", label: "Product truth" },
  { href: "/pricing", label: "Access" },
  { href: "/studio", label: "Studio" },
] as const;

const companyLinks = [
  { href: "/faq", label: "FAQ" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/llms.txt", label: "LLM context" },
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-statement">
        <Link className="footer-brand" href="/">
          Vixel KOC
        </Link>
        <p>
          Creator-native video, grounded in what your product can actually
          prove.
        </p>
      </div>

      <div className="footer-links">
        <div>
          <span>Product</span>
          {productLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </div>
        <div>
          <span>Trust</span>
          {companyLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="footer-base">
        <p>© {new Date().getFullYear()} Vixel. Built for reviewed creative work.</p>
        <p>English · 中文 briefs</p>
      </div>
    </footer>
  );
}
