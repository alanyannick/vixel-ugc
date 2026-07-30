import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Ban, Check, Minus } from "lucide-react";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { StructuredData } from "@/components/marketing/structured-data";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPageMetadata({
  title: "Product truth standard",
  description:
    "How Vixel separates visible facts, source-backed claims, creative expression, and unsupported claims in AI UGC production.",
  path: "/product-truth",
});

const ledgerRows = [
  {
    signal: "Visible fact",
    statement: "The bottle contains 30 ml.",
    source: "Package reference",
    status: "usable",
  },
  {
    signal: "Supported benefit",
    statement: "Designed for a quick morning blend.",
    source: "Product instructions",
    status: "usable",
  },
  {
    signal: "Creator expression",
    statement: "This fits the pace of my morning.",
    source: "Persona framing",
    status: "framing",
  },
  {
    signal: "Unsupported claim",
    statement: "Clinically proven to improve energy.",
    source: "No supplied evidence",
    status: "blocked",
  },
] as const;

export default function ProductTruthPage() {
  return (
    <>
      <StructuredData
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Product truth", path: "/product-truth" },
        ])}
      />
      <PageHero
        eyebrow="Product truth / Standard 01"
        title={
          <>
            Creative freedom needs
            <br />
            a <em>fixed point.</em>
          </>
        }
        body="The product source is that point. Vixel keeps what is observed, what is supported, and what is merely expressive visibly separate."
        tone="paper"
        aside={
          <blockquote className="truth-quote">
            “Trust is more important than the number of models.”
            <cite>Vixel product rule</cite>
          </blockquote>
        }
      />

      <section className="ledger-section dark-section">
        <header className="ledger-header">
          <span className="section-label">Source ledger / example</span>
          <h2>
            Every claim arrives
            <br />
            <em>with its boundary.</em>
          </h2>
        </header>
        <div className="ledger" role="table" aria-label="Example claim ledger">
          <div className="ledger-row ledger-row--head" role="row">
            <span role="columnheader">Signal</span>
            <span role="columnheader">Statement</span>
            <span role="columnheader">Source</span>
            <span role="columnheader">Use</span>
          </div>
          {ledgerRows.map((row) => (
            <div className="ledger-row" role="row" key={row.signal}>
              <span role="cell">{row.signal}</span>
              <strong role="cell">{row.statement}</strong>
              <span role="cell">{row.source}</span>
              <span className={`ledger-status ledger-status--${row.status}`} role="cell">
                {row.status === "usable" ? (
                  <Check aria-hidden="true" size={16} />
                ) : row.status === "blocked" ? (
                  <Ban aria-hidden="true" size={16} />
                ) : (
                  <Minus aria-hidden="true" size={16} />
                )}
                {row.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="truth-principles paper-section">
        <header>
          <span className="section-label section-label--ink">Three boundaries</span>
          <h2>Truth travels with the work.</h2>
        </header>
        <div className="principle-list">
          <article>
            <span>01 / Source</span>
            <h3>The campaign owns the facts.</h3>
            <p>
              Product details and references live at campaign level, not inside
              a one-off prompt that disappears after generation.
            </p>
          </article>
          <article>
            <span>02 / Candidate</span>
            <h3>A result cannot rewrite the brief.</h3>
            <p>
              Provider output is immutable evidence. It can be reviewed,
              protected, rejected, or adopted—but not mistaken for product
              truth.
            </p>
          </article>
          <article>
            <span>03 / Revision</span>
            <h3>Changed inputs mean changed approval.</h3>
            <p>
              Edit a prompt, reference, model, ratio, duration, or audio choice
              and the previous paid-input approval no longer applies.
            </p>
          </article>
        </div>
      </section>

      <section className="truth-policy dark-section">
        <div>
          <span className="section-label">What Vixel refuses to automate</span>
          <h2>
            A polished falsehood is
            <br />
            still a failed output.
          </h2>
        </div>
        <ul>
          <li>Inventing performance, clinical, safety, or comparative claims.</li>
          <li>Passing a generated creator identity off as a real endorsement.</li>
          <li>Auto-adopting a late or unexpected provider result.</li>
          <li>Sending changed paid inputs without a fresh approval.</li>
        </ul>
        <Link className="text-link text-link--light" href="/workflows/ugc-video">
          Follow the production workflow
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <FinalCta
        eyebrow="Start with evidence."
        title="Give the Director facts worth building on."
        body="The studio will flag unsupported claims before they reach the production prompt."
      />
    </>
  );
}
