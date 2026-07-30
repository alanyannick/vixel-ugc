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

const path = "/guides/ugc-vs-koc";
const description =
  "UGC describes user- or creator-made content, while KOC describes a consumer-scale creator role. Learn how both differ from AI-generated UGC ads.";

export const metadata: Metadata = createPageMetadata({
  title: "UGC vs KOC: the difference for product marketing",
  description,
  path,
});

const comparisonFaq = [
  {
    question: "What is the main difference between UGC and KOC?",
    answer:
      "UGC describes content associated with users or creators, while KOC means key opinion consumer and describes a creator or distribution role. A KOC may produce UGC-style content, but the terms do not name the same thing.",
  },
  {
    question: "Is every UGC creator a KOC?",
    answer:
      "No. UGC can come from customers, commissioned creators, or a brand's creator program. KOC is a more specific role built around consumer-scale credibility and product experience.",
  },
  {
    question: "Can an AI-generated person be called a KOC?",
    answer:
      "Generated talent should not be presented as a real KOC or customer. AI-generated creator-style media is clearer when described as AI UGC or a creator-style ad, with disclosure handled according to the relevant channel rules.",
  },
  {
    question: "Which term should a campaign use?",
    answer:
      "Use UGC when the content format or user provenance is the point, KOC when a real creator relationship and distribution role are the point, and AI UGC when generative AI produced the creator-style media.",
  },
] as const;

export default function UgcVsKocGuidePage() {
  return (
    <>
      <StructuredData
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "AI UGC guide", path: "/what-is-ai-ugc" },
            { name: "UGC vs KOC", path },
          ]),
          articleSchema({
            headline: "UGC vs KOC: what is the difference?",
            description,
            path,
            datePublished: "2026-07-30",
            dateModified: "2026-07-30",
          }),
          faqSchema(comparisonFaq),
        ]}
      />

      <PageHero
        eyebrow="Guide / UGC vs KOC"
        title={
          <>
            UGC is the content.
            <br />
            KOC is <em>a creator role.</em>
          </>
        }
        body="The terms can overlap in one campaign, but they answer different questions. AI UGC adds a third distinction: how the media was produced."
        tone="paper"
        aside={
          <ol className="page-hero-index">
            <li>
              <span>01</span> UGC / content
            </li>
            <li>
              <span>02</span> KOC / role
            </li>
            <li>
              <span>03</span> AI UGC / method
            </li>
            <li>
              <span>04</span> Truth / provenance
            </li>
          </ol>
        }
      />

      <section className="guide-definition dark-section">
        <div>
          <span className="section-label">The short answer</span>
          <h2>
            Related terms,
            <br />
            <em>different meanings.</em>
          </h2>
        </div>
        <div className="guide-definition-copy">
          <p>
            User-generated content, or UGC, refers to media associated with
            users or creators. A key opinion consumer, or KOC, is a person whose
            creator role is framed around consumer-scale product credibility.
          </p>
          <p>
            A real KOC can make UGC-style media. A commissioned UGC creator is
            not automatically a KOC. AI UGC can borrow the same visual language,
            but generated talent is neither a customer nor a real KOC.
          </p>
          <Link className="text-link text-link--light" href="/what-is-ai-ugc">
            Read the AI UGC definition
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </section>

      <section className="decision-gates paper-section">
        <header>
          <span className="section-label section-label--ink">
            One campaign, three questions
          </span>
          <h2>Name the content, the person, and the production method.</h2>
        </header>
        <div className="gate-list">
          <article>
            <span>01</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>UGC</h3>
            <p>
              Answers what kind of content this is and, when applicable, where
              its user or creator provenance comes from.
            </p>
          </article>
          <article>
            <span>02</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>KOC</h3>
            <p>
              Answers who is creating or distributing the message: a real
              consumer-scale creator whose product experience matters.
            </p>
          </article>
          <article>
            <span>03</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>AI UGC</h3>
            <p>
              Answers how creator-style ad media was produced: with generative
              AI rather than an unscripted customer recording.
            </p>
          </article>
        </div>
        <Link className="text-link text-link--ink" href="/ugc-ad-generator">
          Explore the AI UGC ad generator
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <section className="truth-policy dark-section">
        <div>
          <span className="section-label">The provenance rule</span>
          <h2>
            Style can overlap.
            <br />
            <em>Origin should stay clear.</em>
          </h2>
        </div>
        <ul>
          <li>Do not describe generated talent as an actual customer.</li>
          <li>Do not imply a real KOC relationship when none exists.</li>
          <li>Keep product claims tied to supplied and approved evidence.</li>
          <li>Use labels and disclosures appropriate to the publishing channel.</li>
        </ul>
        <Link className="text-link text-link--light" href="/product-truth">
          See how Vixel separates facts from expression
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <section className="faq-section paper-section">
        <div className="faq-index">
          <span className="section-label section-label--ink">
            {comparisonFaq.length} direct answers
          </span>
          <p>
            The practical distinction is provenance: identify the content, the
            creator relationship, and the production method separately.
          </p>
        </div>
        <div className="faq-list">
          {comparisonFaq.map((item, index) => (
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
        eyebrow="Keep the terminology honest."
        title="Build creator-style media without inventing a creator relationship."
        body="Vixel starts with approved product facts, makes the production method explicit, and keeps every paid input reviewable."
      />
    </>
  );
}
