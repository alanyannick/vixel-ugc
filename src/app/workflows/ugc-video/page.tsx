import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, CircleDotDashed } from "lucide-react";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { StructuredData } from "@/components/marketing/structured-data";
import { WorkflowSequence } from "@/components/marketing/workflow-sequence";
import { breadcrumbSchema, howToSchema } from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPageMetadata({
  title: "AI UGC video production workflow",
  description:
    "See how Vixel turns source-backed product facts into AI UGC video ads through creative routes, exact paid-input approval, generation, review, and delivery.",
  path: "/workflows/ugc-video",
});

const productionChecks = [
  "A concrete first-three-seconds hook",
  "Timed, word-for-word creator dialogue",
  "Visible product action and shot direction",
  "Native dialogue and room-sound direction",
  "One continuous 4, 6, or 8-second clip",
] as const;

const workflowSteps = [
  {
    name: "Brief",
    text: "Ground the campaign in supplied product facts, then choose one hook and one creator persona.",
  },
  {
    name: "Assets",
    text: "When the route needs it, create and review a visual anchor before video production.",
  },
  {
    name: "Production",
    text: "Review and lock the exact provider input before a separately confirmed generation request.",
  },
  {
    name: "Post",
    text: "When needed, finish the selected candidate and export its delivery receipt.",
  },
] as const;

export default function UgcWorkflowPage() {
  return (
    <>
      <StructuredData
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "AI UGC video workflow", path: "/workflows/ugc-video" },
          ]),
          howToSchema({
            name: "How to create a reviewed AI UGC product video",
            description:
              "A four-stage workflow from source-backed product brief to reviewed and traceable video candidate.",
            path: "/workflows/ugc-video",
            steps: workflowSteps,
          }),
        ]}
      />
      <PageHero
        eyebrow="Workflow / AI UGC video"
        title={
          <>
            From product truth
            <br />
            to a <em>reviewed video candidate.</em>
          </>
        }
        body="A four-stage system for producing creator-style product ads without letting generation outrun product evidence or human review."
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
            when the selected UGC route needs a stronger visual anchor or a
            deterministic finish.
          </p>
        </div>
        <WorkflowSequence />
      </section>

      <section className="workflow-anatomy dark-section">
        <div className="workflow-anatomy-media">
          <Image
            alt="Hands presenting wireless earbuds during a casual creator-style unboxing"
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
            <em>an exact video input.</em>
          </h2>
          <p>
            Production does not stop at a loose concept. It creates the exact
            provider input, locks it for review, and preserves every output as
            an immutable candidate.
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
              Pick one hook and creator persona before the plan moves into
              asset or production work.
            </p>
          </article>
          <article>
            <span>02</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>Lock exact input</h3>
            <p>
              Review the canonical prompt, ordered references, ratio, duration,
              model, resolution, and audio before provider spend.
            </p>
          </article>
          <article>
            <span>03</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>Adopt a candidate</h3>
            <p>
              Generated media remains a candidate until you explicitly accept
              it into the campaign and export the delivery receipt.
            </p>
          </article>
        </div>
        <Link className="text-link text-link--ink" href="/product-truth">
          See how product claims stay grounded
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <FinalCta
        eyebrow="The AI UGC workflow is ready."
        title="Bring one product and one honest goal."
        body="Vixel will structure the routes, checkpoints, and production work around the facts you approve."
      />
    </>
  );
}
