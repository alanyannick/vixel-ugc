import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { PositioningBand } from "@/components/marketing/positioning-band";
import { RouteProof } from "@/components/marketing/route-proof";
import { SectionHeading } from "@/components/marketing/section-heading";
import { StructuredData } from "@/components/marketing/structured-data";
import { TracePanel } from "@/components/marketing/trace-panel";
import { WorkflowSequence } from "@/components/marketing/workflow-sequence";
import { softwareSchema } from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPageMetadata({
  title: "AI UGC video campaign planning beta",
  description:
    "Plan source-grounded AI UGC product-video campaigns with five creative routes and exact paid-input review. Hosted generation requires live provider and ledger readiness.",
  path: "/",
});

export default function HomePage() {
  return (
    <>
      <StructuredData data={softwareSchema} />
      <Hero />
      <PositioningBand />

      <section className="paper-section route-section" id="routes">
        <SectionHeading
          index="01"
          eyebrow="Creative direction"
          title={
            <>
              One brief. Five routes.
              <br />
              <em>One decision.</em>
            </>
          }
          description="Creative Router expands a source-grounded product brief into meaningfully different UGC hooks, then waits for your choice before paid work begins."
          inverted
        />
        <RouteProof />
      </section>

      <section className="dark-section workflow-section">
        <SectionHeading
          index="02"
          eyebrow="Durable workflow"
          title={
            <>
              A production plan you can
              <br />
              <em>inspect, pause, and recover.</em>
            </>
          }
          description="One visible Creative Router directs the work. Each stage has a clear owner, checkpoint, output, and recovery path."
        />
        <WorkflowSequence />
        <Link className="text-link text-link--light workflow-link" href="/workflows/ugc-video">
          Explore the full AI UGC video workflow
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <section className="paper-section truth-section">
        <div className="truth-media">
          <Image
            alt="Creator showing a compact blender during a natural kitchen demonstration"
            fill
            sizes="(max-width: 800px) 100vw, 50vw"
            src="/media/koc-blender-demo.webp"
          />
          <div className="truth-media-note">
            <span>Product action first</span>
            <span>Claim follows proof</span>
          </div>
        </div>
        <div className="truth-copy">
          <span className="section-label section-label--ink">03 / Product truth</span>
          <h2>
            If the source cannot support it,
            <br />
            <em>the ad cannot say it.</em>
          </h2>
          <p>
            Vixel keeps visible facts, inferred benefits, unsupported claims,
            and creative expression separate. That boundary travels with the
            campaign.
          </p>
          <ul className="truth-rules">
            <li>
              <Check aria-hidden="true" size={18} />
              Claims retain their source.
            </li>
            <li>
              <Check aria-hidden="true" size={18} />
              Candidate results never overwrite approved truth.
            </li>
            <li>
              <Check aria-hidden="true" size={18} />
              References have explicit product or creator roles.
            </li>
          </ul>
          <Link className="text-link text-link--ink" href="/product-truth">
            Read the product truth standard
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </section>

      <section className="dark-section receipt-section">
        <div className="receipt-copy">
          <span className="section-label">04 / Paid-result protection</span>
          <h2>
            The output is creative.
            <br />
            <em>The lineage is exact.</em>
          </h2>
          <p>
            Prompt, model, references, aspect ratio, duration, and audio form
            one canonical paid input. Change any of them and approval resets.
          </p>
          <div className="receipt-assurance">
            <ShieldCheck aria-hidden="true" size={22} />
            <div>
              <strong>Generate deliberately</strong>
              <span>Retry failed work without duplicating successful jobs.</span>
            </div>
          </div>
        </div>
        <TracePanel />
      </section>

      <FinalCta />
    </>
  );
}
