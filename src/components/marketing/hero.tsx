import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ImagePlus,
  Link2,
  Sparkles,
} from "lucide-react";

const formats = [
  {
    src: "/media/koc-earbuds-unboxing.webp",
    alt: "Hands opening wireless earbuds in a natural creator setup",
    label: "Unbox & react",
    meta: "Product-first hook",
  },
  {
    src: "/media/koc-serum-creator.webp",
    alt: "Creator holding a skincare serum in a lived-in apartment",
    label: "Creator proof",
    meta: "Native UGC demo",
  },
  {
    src: "/media/koc-blender-demo.webp",
    alt: "Creator demonstrating a compact blender in a home kitchen",
    label: "Problem to result",
    meta: "Action-led story",
  },
] as const;

export function Hero() {
  return (
    <section className="composer-hero">
      <div className="hero-grain" aria-hidden="true" />
      <div className="composer-hero-heading">
        <p>VIXEL UGC / PRIVATE BETA</p>
        <h1>
          Turn any product
          <br />
          <em>into a creator ad.</em>
        </h1>
        <span>
          Start with a product link and an angle. Vixel grounds the campaign in
          source truth, routes five hooks, and keeps every paid generation
          reviewable.
        </span>
      </div>

      <form className="campaign-composer" action="/waitlist" method="get">
        <input name="source" type="hidden" value="homepage-composer" />
        <label className="composer-url">
          <Link2 aria-hidden="true" size={18} />
          <span className="sr-only">Product link</span>
          <input
            autoComplete="url"
            maxLength={512}
            name="productUrl"
            placeholder="Paste a product page, Amazon, Shopify, TikTok Shop…"
            type="url"
          />
        </label>
        <label className="composer-intent">
          <Sparkles aria-hidden="true" size={18} />
          <span className="sr-only">Campaign idea</span>
          <textarea
            maxLength={500}
            name="intent"
            placeholder="What should the creator prove? e.g. Show the 10-second setup and first-use reaction."
            rows={2}
          />
        </label>
        <div className="composer-controls">
          <span>
            <ImagePlus aria-hidden="true" size={16} />
            Product reference
          </span>
          <span>9:16 UGC</span>
          <button type="submit">
            Build campaign
            <ArrowRight aria-hidden="true" size={18} />
          </button>
        </div>
      </form>

      <div className="format-browser">
        <div className="format-tabs" aria-label="Featured creative formats">
          <span className="format-tab-active">All formats</span>
          <span>TikTok hooks</span>
          <span>UGC proof</span>
          <span>Commercial</span>
        </div>
        <div className="format-grid">
          {formats.map((format) => (
            <Link
              href={`/waitlist?source=format-card&intent=${encodeURIComponent(format.label)}`}
              key={format.src}
            >
              <figure>
                <Image
                  alt={format.alt}
                  fill
                  priority
                  sizes="(max-width: 760px) 82vw, 28vw"
                  src={format.src}
                />
              </figure>
              <span>
                <strong>{format.label}</strong>
                <small>{format.meta}</small>
              </span>
              <em>Try</em>
            </Link>
          ))}
        </div>
      </div>

      <div className="composer-hero-footer">
        <a href="#routes">
          <ArrowDown aria-hidden="true" size={15} />
          Explore how it works
        </a>
        <span>Source → Route → Approve → Generate</span>
      </div>
    </section>
  );
}
