import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";

const creatorFrames = [
  {
    src: "/media/koc-earbuds-unboxing.webp",
    alt: "Hands opening a pair of wireless earbuds in a natural creator setup",
    label: "01 / Unbox",
    className: "hero-frame hero-frame--left",
  },
  {
    src: "/media/koc-serum-creator.webp",
    alt: "Creator holding a skincare serum bottle in a lived-in apartment",
    label: "02 / Use",
    className: "hero-frame hero-frame--center",
  },
  {
    src: "/media/koc-blender-demo.webp",
    alt: "Creator demonstrating a compact blender in a home kitchen",
    label: "03 / Prove",
    className: "hero-frame hero-frame--right",
  },
] as const;

export function Hero() {
  return (
    <section className="hero">
      <div className="hero-grain" aria-hidden="true" />
      <div className="hero-copy">
        <p className="hero-series">VIXEL UGC / PLANNING BETA 01</p>
        <p className="hero-brand">VIXEL UGC</p>
        <h1>
          Plan AI UGC video campaigns,
          <br />
          grounded in product truth.
        </h1>
        <p className="hero-intro">
          Turn approved product facts and visual references into five creator
          routes and one reviewed production plan. Live-ready studios can then
          submit approved inputs for traceable 4, 6, or 8-second candidates.
        </p>
        <div className="button-row">
          <Link className="button button--citron" href="/studio">
            Open the planning studio
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link className="button button--ghost" href="/workflows/ugc-video">
            See how it works
          </Link>
        </div>
      </div>

      <div className="hero-contact-sheet" aria-label="Creator video directions">
        {creatorFrames.map((frame, index) => (
          <figure className={frame.className} key={frame.src}>
            <Image
              alt={frame.alt}
              fill
              priority
              sizes="(max-width: 760px) 62vw, 28vw"
              src={frame.src}
              style={{ animationDelay: `${120 + index * 100}ms` }}
            />
            <figcaption>
              <span>{frame.label}</span>
              <span>9:16</span>
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="hero-stage-rail" aria-label="Campaign stages">
        <span>Source</span>
        <span>Route</span>
        <span>Approve</span>
        <span>Generate</span>
        <span>Adopt</span>
      </div>

      <a className="hero-scroll" href="#routes" aria-label="Explore the product">
        <ArrowDown aria-hidden="true" size={16} />
        Explore the workflow
      </a>
    </section>
  );
}
