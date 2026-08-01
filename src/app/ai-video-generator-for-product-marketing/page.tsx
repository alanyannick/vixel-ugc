import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleDotDashed } from "lucide-react";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { StructuredData } from "@/components/marketing/structured-data";
import { articleSchema, breadcrumbSchema, faqSchema } from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";

const path = "/ai-video-generator-for-product-marketing";
const description =
  "Plan grounded AI product video campaigns with approved claims, creator angles, cloud recovery, exact-input review, and traceable media candidates.";

export const metadata: Metadata = createPageMetadata({
  title: "AI video generator for product marketing",
  description,
  path,
});

const marketingVideoFaq = [
  {
    question: "What makes an AI video generator useful for product marketing?",
    answer:
      "A product-marketing workflow needs more than motion. It should preserve approved product facts, connect each creative angle to an audience and action, expose the exact production input, and keep generated results reviewable before publishing.",
  },
  {
    question: "Does Vixel Campaigns generate finished product videos?",
    answer:
      "Vixel Campaigns is an account-based private beta for planning and managing a UGC Campaign. Approved accounts can save and reload campaign work in the cloud when that deployment capability is ready, with browser recovery and JSON export as fallbacks. A paid image or video job can run only when account, subscription, provider, deployment, and isolated-ledger checks all pass.",
  },
  {
    question: "Can the workflow use my product images?",
    answer:
      "Yes. Product and creator references have explicit roles in the campaign. The exact ordered reference set is included in review before a ready deployment can submit a paid media job.",
  },
  {
    question: "Is Vixel Campaigns a general-purpose effects app?",
    answer:
      "No. It is a web campaign workspace for source-grounded creator-style product marketing. It focuses on the brief, Creative Router, account-scoped campaign state, review boundary, and delivery lineage rather than a library of consumer photo effects.",
  },
] as const;

export default function ProductMarketingVideoPage() {
  return (
    <>
      <StructuredData
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "AI video for product marketing", path },
          ]),
          articleSchema({
            headline: "How to plan AI video for product marketing",
            description,
            path,
            datePublished: "2026-08-01",
            dateModified: "2026-08-01",
          }),
          faqSchema(marketingVideoFaq),
        ]}
      />

      <PageHero
        eyebrow="Use case / Product video marketing"
        title={
          <>
            Plan product video campaigns
            <br />
            <em>before you generate.</em>
          </>
        }
        body="Move from approved product evidence to creator angles, scripts, storyboards, and production-ready inputs. Vixel keeps the campaign decision reviewable and gives approved accounts cloud continuity before any ready deployment receives a paid request."
        aside={
          <ol className="page-hero-index">
            <li>
              <span>01</span> Product evidence
            </li>
            <li>
              <span>02</span> Creator routes
            </li>
            <li>
              <span>03</span> Exact-input review
            </li>
            <li>
              <span>04</span> Candidate lineage
            </li>
          </ol>
        }
      />

      <section className="decision-gates paper-section">
        <header>
          <span className="section-label section-label--ink">
            From generator to campaign
          </span>
          <h2>Motion is an output. Marketing needs a decision system.</h2>
        </header>
        <div className="gate-list">
          <article>
            <span>01</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>Ground the promise</h3>
            <p>
              Separate visible facts, supported benefits, and creative
              expression so the video brief does not invent a product claim.
            </p>
          </article>
          <article>
            <span>02</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>Route the idea</h3>
            <p>
              Compare meaningfully different hooks and creator directions
              against the audience, channel, and desired action.
            </p>
          </article>
          <article>
            <span>03</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>Review the job</h3>
            <p>
              Lock the exact prompt, references, model, ratio, duration, and
              audio before a separate potentially billable submission.
            </p>
          </article>
        </div>
        <Link className="text-link text-link--ink" href="/workflows/ugc-video">
          Follow the UGC Campaign workflow
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <section className="truth-policy dark-section">
        <div>
          <span className="section-label">Choose the right Vixel</span>
          <h2>
            Looking for the similarly named
            <br />
            <em>iPhone video app?</em>
          </h2>
        </div>
        <ul>
          <li>Vixel Campaigns is an independently operated web product.</li>
          <li>
            It does not manage another app&apos;s account, credits,
            subscription, or support.
          </li>
          <li>
            This account-based studio is built for grounded UGC campaign
            planning and review.
          </li>
          <li>
            A dedicated comparison page links to the correct App Store listing.
          </li>
        </ul>
        <Link
          className="text-link text-link--light"
          href="/compare/vixel-ai-video-generator-app"
        >
          Compare the two independent products
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <section className="faq-section paper-section">
        <div className="faq-index">
          <span className="section-label section-label--ink">
            {marketingVideoFaq.length} direct answers
          </span>
          <p>
            The private beta keeps account, cloud, billing, provider, and
            generation readiness separate so unavailable capabilities fail
            closed.
          </p>
        </div>
        <div className="faq-list">
          {marketingVideoFaq.map((item, index) => (
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
        eyebrow="Build the campaign before you buy the render."
        title="Turn product truth into production-ready UGC directions."
        body="Use the UGC Campaign workflow, compare five Creative Router directions, and keep cloud, browser, and export recovery paths before any readiness-gated media submission."
      />
    </>
  );
}
