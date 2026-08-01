import Link from "next/link";

const productLinks = [
  { href: "/ugc-ad-generator", label: "UGC ad generator" },
  {
    href: "/ai-video-generator-for-product-marketing",
    label: "AI video for marketing",
  },
  { href: "/workflows/ugc-video", label: "UGC workflow" },
  { href: "/what-is-ai-ugc", label: "What is AI UGC?" },
  { href: "/product-truth", label: "Product truth" },
] as const;

const companyLinks = [
  { href: "/guides/ugc-vs-koc", label: "UGC vs KOC" },
  {
    href: "/compare/vixel-ai-video-generator-app",
    label: "Vixel app vs web studio",
  },
  { href: "/access", label: "Beta access" },
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
          <span>Vixel</span>
          <em>Campaigns</em>
        </Link>
        <p>
          UGC Campaign turns approved product facts into reviewable
          creator-style ad plans. Current release: planning beta.
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
        <p>English interface · English and 中文 briefs</p>
      </div>
      <p className="footer-disclaimer">
        Vixel Campaigns is an independently operated web product. It is not
        affiliated with, endorsed by, or operated by any third-party mobile app
        or App Store publisher using a similar name.
      </p>
    </footer>
  );
}
