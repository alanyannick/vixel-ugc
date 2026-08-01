import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ImagePlus, Link2, Sparkles } from "lucide-react";

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

export function Hero({
  paidGenerationConfigured,
}: {
  paidGenerationConfigured: boolean;
}) {
  return (
    <>
      <section className="composer-hero">
        <div className="hero-grain" aria-hidden="true" />
        <div className="composer-hero-heading">
          <p className="composer-hero-kicker">VIXEL UGC / PRIVATE BETA</p>
          <h1>
            One product link. <em>Five creator ad directions.</em>
          </h1>
          <p className="composer-hero-summary">
            Ground every hook in approved product facts. Compare five creative
            angles, choose one, and build a reviewable production plan for
            TikTok, Reels, and Shorts.
          </p>
        </div>

        <form className="campaign-composer" action="/waitlist" method="get">
          <input name="source" type="hidden" value="homepage-composer" />
          <label className="composer-url">
            <Link2 aria-hidden="true" size={18} />
            <span className="composer-field">
              <span className="composer-field-label">Product link</span>
              <input
                autoComplete="url"
                maxLength={512}
                name="productUrl"
                placeholder="Paste a product page or shop URL…"
                type="url"
              />
            </span>
          </label>
          <label className="composer-intent">
            <Sparkles aria-hidden="true" size={18} />
            <span className="composer-field">
              <span className="composer-field-label">Campaign idea</span>
              <textarea
                maxLength={500}
                name="intent"
                placeholder="Show the 10-second setup and first-use reaction…"
                rows={2}
              />
            </span>
          </label>
          <div className="composer-controls">
            <div className="composer-meta" aria-label="Campaign plan output">
              <span>
                <ImagePlus aria-hidden="true" size={16} />
                Product link + brief
              </span>
              <span>5 creative routes</span>
            </div>
            <button type="submit">
              Join beta with brief
              <ArrowRight aria-hidden="true" size={18} />
            </button>
          </div>
        </form>

        <div className="composer-status">
          <span className="status-dot" aria-hidden="true" />
          <p>
            {paidGenerationConfigured
              ? "Planning is available. Paid generation still requires an approved, entitled account and exact-input review."
              : "Planning is available in private beta. Paid generation is currently disabled."}
          </p>
          <a href="#routes">
            See how it works
            <ArrowRight aria-hidden="true" size={14} />
          </a>
        </div>
      </section>

      <section
        className="format-browser-section"
        aria-labelledby="format-browser-title"
      >
        <div className="format-browser">
          <div className="format-browser-heading">
            <span>Creator starting points</span>
            <h2 id="format-browser-title">Start from the product action.</h2>
            <p>
              Choose an opening angle, then make the product prove the claim.
              These examples are creative routes, not performance promises.
            </p>
          </div>
          <div className="format-grid">
            {formats.map((format) => (
              <Link
                aria-label={`Use ${format.label} as a campaign angle`}
                href={`/waitlist?source=format-card&intent=${encodeURIComponent(format.label)}`}
                key={format.src}
              >
                <figure>
                  <Image
                    alt={format.alt}
                    fill
                    sizes="(max-width: 760px) 82vw, 28vw"
                    src={format.src}
                  />
                </figure>
                <span>
                  <strong>{format.label}</strong>
                  <small>{format.meta}</small>
                </span>
                <span className="format-card-cta">
                  Use angle
                  <ArrowRight aria-hidden="true" size={13} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
