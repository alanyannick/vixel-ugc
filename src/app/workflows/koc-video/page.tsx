import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, CircleDotDashed } from "lucide-react";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { StructuredData } from "@/components/marketing/structured-data";
import { WorkflowSequence } from "@/components/marketing/workflow-sequence";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPageMetadata({
  title: "KOC video workflow",
  description:
    "See the Vixel workflow for source-backed KOC and UGC product video: brief, conditional assets, production, conditional post, and adoption.",
  path: "/workflows/koc-video",
});

const productionChecks = [
  "A concrete first-three-seconds hook",
  "Timed, word-for-word creator dialogue",
  "Visible product action and shot direction",
  "Native dialogue and sound path",
  "A continuous clip when a ≤15 second route allows it",
] as const;

export default function KocWorkflowPage() {
  return (
    <>
      <StructuredData
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "KOC video workflow", path: "/workflows/koc-video" },
        ])}
      />
      <PageHero
        eyebrow="Workflow / KOC video"
        title={
          <>
            From grounded brief
            <br />
            to <em>publishable candidate.</em>
          </>
        }
        body="A four-stage system for producing creator-native product video without letting generation outrun review."
        aside={
          <ol className="page-hero-index">
            <li>
              <span>01</span> Brief
            </li>
            <li>
              <span>02</span> Assets <em>if needed</em>
            </li>
            <li>
              <span>03</span> Production
            </li>
            <li>
              <span>04</span> Post <em>if needed</em>
            </li>
          </ol>
        }
      />

      <section className="workflow-page-sequence paper-section">
        <div className="workflow-page-intro">
          <span className="section-label section-label--ink">The plan</span>
          <h2>
            Every stage has a reason
            <br />
            <em>to exist—or to be skipped.</em>
          </h2>
          <p>
            Conditional stages are not ceremony. The Director adds them only
            when the selected route needs a stronger anchor or deterministic
            finish.
          </p>
        </div>
        <WorkflowSequence />
      </section>

      <section className="workflow-anatomy dark-section">
        <div className="workflow-anatomy-media">
          <Image
            alt="Hands presenting wireless earbuds during a casual unboxing"
            fill
            sizes="(max-width: 900px) 100vw, 44vw"
            src="/media/koc-earbuds-unboxing.webp"
          />
          <div className="frame-code">
            <span>TAKE 02</span>
            <span>00:03.2</span>
          </div>
        </div>
        <div className="workflow-anatomy-copy">
          <span className="section-label">Production anatomy</span>
          <h2>
            A route becomes
            <br />
            <em>something shootable.</em>
          </h2>
          <p>
            The production stage does not stop at a concept document. It creates
            the exact input for a media job and preserves the output as a
            candidate.
          </p>
          <ul>
            {productionChecks.map((item) => (
              <li key={item}>
                <Check aria-hidden="true" size={17} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="decision-gates paper-section">
        <header>
          <span className="section-label section-label--ink">
            Human decisions, exactly where they matter
          </span>
          <h2>Three gates. No invisible leap.</h2>
        </header>
        <div className="gate-list">
          <article>
            <span>01</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>Choose a route</h3>
            <p>
              Pick one hook and persona before the plan moves into asset or
              production work.
            </p>
          </article>
          <article>
            <span>02</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>Approve paid input</h3>
            <p>
              Review the canonical prompt, references, ratio, duration, model,
              and audio path.
            </p>
          </article>
          <article>
            <span>03</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>Adopt a candidate</h3>
            <p>
              Generated media stays immutable until you choose what enters the
              campaign.
            </p>
          </article>
        </div>
        <Link className="text-link text-link--ink" href="/product-truth">
          See how claims stay grounded
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <FinalCta
        eyebrow="The workflow is ready."
        title="Bring one product and one honest goal."
        body="Vixel will structure the routes, checkpoints, and production work around them."
      />
    </>
  );
}
