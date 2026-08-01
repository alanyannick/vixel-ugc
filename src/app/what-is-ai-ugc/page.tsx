import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleDotDashed } from "lucide-react";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { StructuredData } from "@/components/marketing/structured-data";
import {
  articleSchema,
  breadcrumbSchema,
  faqSchema,
} from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";

const path = "/what-is-ai-ugc";
const description =
  "AI UGC is creator-style ad media made with generative AI. Learn how it differs from filmed UGC and KOC, and why product evidence still matters.";

export const metadata: Metadata = createPageMetadata({
  title: "What is AI UGC? Creator ads explained",
  description,
  path,
});

const guideFaq = [
  {
    question: "What does AI UGC mean?",
    answer:
      "AI UGC means creator-style advertising media produced with generative AI instead of being filmed as an unscripted customer post. It can borrow the direct camera language of UGC, but it should not be represented as a real customer's endorsement.",
  },
  {
    question: "Is AI UGC the same as a KOC campaign?",
    answer:
      "No. KOC describes a creator or distribution role built around credible consumer-scale influence. AI UGC describes how creator-style media is produced. A campaign can use KOC-inspired creative direction without claiming that generated talent is a real KOC.",
  },
  {
    question: "What inputs does an AI UGC video generator need?",
    answer:
      "A useful workflow needs approved product facts, audience, platform, campaign goal, visual references, a chosen hook and creator direction, plus explicit output settings such as ratio, duration, resolution, and audio.",
  },
  {
    question: "How does Vixel keep AI UGC product-accurate?",
    answer:
      "Vixel separates visible facts, supported benefits, creator expression, and unsupported claims. It then binds the exact prompt, references, model, ratio, duration, resolution, and audio to a human approval before paid generation.",
  },
] as const;

export default function WhatIsAiUgcPage() {
  return (
    <>
      <StructuredData
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "What is AI UGC?", path },
          ]),
          articleSchema({
            headline: "What is AI UGC?",
            description,
            path,
            datePublished: "2026-07-30",
            dateModified: "2026-08-01",
          }),
          faqSchema(guideFaq),
        ]}
      />

      <PageHero
        eyebrow="Guide / AI UGC"
        title={
          <>
            AI UGC is creator-style ad media
            <br />
            <em>produced with generative AI.</em>
          </>
        }
        body="It uses the direct, product-in-hand language of social creator content without pretending that generated talent is an unscripted customer endorsement."
        tone="paper"
        aside={
          <ol className="page-hero-index">
            <li>
              <span>01</span> Definition
            </li>
            <li>
              <span>02</span> UGC vs KOC
            </li>
            <li>
              <span>03</span> Product truth
            </li>
            <li>
              <span>04</span> Workflow
            </li>
          </ol>
        }
      />

      <section className="guide-definition dark-section">
        <div>
          <span className="section-label">The short answer</span>
          <h2>
            A production method,
            <br />
            <em>not a fake customer.</em>
          </h2>
        </div>
        <div className="guide-definition-copy">
          <p>
            AI UGC video combines a source-backed product brief, creator-style
            hook, visual references, generated media, and human review into a
            short-form ad workflow.
          </p>
          <p>
            The useful distinction is provenance: filmed UGC comes from a real
            person and shoot; AI UGC is generated. The visual language may be
            similar, but the origin and endorsement should not be blurred.
          </p>
          <Link className="text-link text-link--light" href="/workflows/ugc-video">
            See the complete workflow
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </section>

      <section className="decision-gates paper-section">
        <header>
          <span className="section-label section-label--ink">
            Three terms that answer different questions
          </span>
          <h2>UGC, AI UGC, and KOC are not interchangeable.</h2>
        </header>
        <div className="gate-list">
          <article>
            <span>01</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>Filmed UGC</h3>
            <p>
              Customer or creator media recorded by a real person. Its value
              comes from lived provenance, not merely a handheld visual style.
            </p>
          </article>
          <article>
            <span>02</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>AI UGC</h3>
            <p>
              Generated creator-style ad media. It is useful for creative
              exploration and production, but is not evidence of a real
              customer experience.
            </p>
          </article>
          <article>
            <span>03</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>KOC</h3>
            <p>
              A key opinion consumer: a consumer-scale creator role associated
              with credible product experience, especially in Asian marketing
              contexts.
            </p>
          </article>
        </div>
      </section>

      <section className="truth-policy dark-section">
        <div>
          <span className="section-label">Where Vixel draws the line</span>
          <h2>
            Creator-style does not mean
            <br />
            <em>claim-free.</em>
          </h2>
        </div>
        <ul>
          <li>Use supplied facts and approved product references.</li>
          <li>Label generated talent and media according to your channel rules.</li>
          <li>Do not turn creator expression into an unsupported product claim.</li>
          <li>Keep every paid input reviewable before provider submission.</li>
        </ul>
        <Link className="text-link text-link--light" href="/product-truth">
          Read the product truth standard
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <section className="faq-section paper-section">
        <div className="faq-index">
          <span className="section-label section-label--ink">Four direct answers</span>
          <p>
            Definitions are intentionally separated from performance claims.
            Vixel does not promise that a visual style alone will convert.
          </p>
        </div>
        <div className="faq-list">
          {guideFaq.map((item, index) => (
            <details key={item.question}>
              <summary>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item.question}</strong>
                <i aria-hidden="true" />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <FinalCta
        eyebrow="From definition to a reviewable campaign."
        title="Build creator-style media without losing product truth."
        body="Start with the demo campaign or bring your own approved product facts and references."
      />
    </>
  );
}
