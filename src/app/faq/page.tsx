import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { StructuredData } from "@/components/marketing/structured-data";
import { breadcrumbSchema, faqSchema } from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPageMetadata({
  title: "Frequently asked questions",
  description:
    "Answers about Vixel UGC Studio, AI UGC and KOC, product claims, live generation, campaign storage, and provider data.",
  path: "/faq",
});

const faqItems = [
  {
    id: "what-is-vixel",
    question: "What is Vixel UGC Studio?",
    answer:
      "Vixel is an AI UGC campaign workspace for planning and producing creator-style product videos. It turns source-backed product facts into five creative routes, one reviewed plan, paid media jobs, and traceable candidates.",
  },
  {
    id: "what-is-ai-ugc",
    question: "What does AI UGC mean?",
    answer:
      "AI UGC is creator-style advertising media produced with generative AI. It can use the direct visual language of filmed UGC, but it should not be represented as a real customer's unscripted endorsement.",
  },
  {
    id: "koc-vs-ugc",
    question: "How are AI UGC and KOC different?",
    answer:
      "AI UGC describes a production method. KOC means key opinion consumer and describes a creator or distribution role associated with credible consumer-scale influence. Vixel can use KOC-inspired creative direction without claiming that generated talent is a real KOC.",
  },
  {
    id: "product-claims",
    question: "Does Vixel invent product claims?",
    answer:
      "No. Visible facts and supported benefits retain their source. Unsupported claims are marked and should not enter generation. Creator expression can shape tone and lived experience, but it cannot turn an unsupported statement into a fact.",
  },
  {
    id: "live-generation",
    question: "When does live generation happen?",
    answer:
      "Selecting a route does not start generation. In an enabled studio, you first review and lock the exact input without provider spend, then separately confirm one potentially billable submission.",
  },
  {
    id: "paid-input",
    question: "What counts as a paid input change?",
    answer:
      "The prompt, model, reference set, aspect ratio, duration, and audio path belong to one canonical input. Changing any of them invalidates the previous approval and requires a new review.",
  },
  {
    id: "storage",
    question: "Where is campaign data stored?",
    answer:
      "Campaign planning state stays in the browser and can be exported as JSON. An enabled deployment keeps paid-job status and result claims in a private PostgreSQL ledger under a signed pseudonymous recovery identity. Approved inputs pass through the server to the provider; provider credentials never reach the browser.",
  },
  {
    id: "outputs",
    question: "What does the current workflow generate?",
    answer:
      "The Director creates five hook routes and three creator personas. In an enabled studio, the media workflow can produce one reviewed visual anchor and a 9:16 video candidate with a 4, 6, or 8-second duration.",
  },
  {
    id: "publishing",
    question: "Does Vixel publish ads to social platforms?",
    answer:
      "No. Vixel produces reviewable campaign plans and media candidates. You remain responsible for final brand, legal, disclosure, and platform review before exporting and publishing anything.",
  },
  {
    id: "export",
    question: "Can I export and restore a campaign?",
    answer:
      "Yes. The campaign can be exported as a structured JSON file and restored later, including product facts, selected route, plan state, and available receipts.",
  },
  {
    id: "brand",
    question: "Is this studio part of a similarly named mobile app?",
    answer:
      "No. Vixel UGC Studio is an independently operated web product and is not affiliated with third-party mobile applications using a similar name.",
  },
] as const;

export default function FaqPage() {
  return (
    <>
      <StructuredData
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "FAQ", path: "/faq" },
          ]),
          faqSchema(faqItems),
        ]}
      />
      <PageHero
        eyebrow="FAQ / Product and trust"
        title={
          <>
            Clear answers before
            <br />
            <em>creative work begins.</em>
          </>
        }
        body="What you need to start, what gets generated, when provider spend begins, and how product claims and campaign data stay under review."
        aside={
          <div className="faq-aside">
            <span>Need the sequence?</span>
            <Link href="/workflows/ugc-video">
              Read the four-stage workflow
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
        }
      />

      <section className="faq-section paper-section">
        <div className="faq-index">
          <span className="section-label section-label--ink">
            {faqItems.length} direct answers
          </span>
          <p>
            Every answer describes the current product boundary. Provider
            availability may differ by deployment.
          </p>
        </div>
        <div className="faq-list">
          {faqItems.map((item, index) => (
            <details id={item.id} key={item.id}>
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

      <section className="faq-contact dark-section">
        <span className="section-label">Still deciding?</span>
        <h2>Try the campaign workflow with demo inputs first.</h2>
        <Link className="button button--citron" href="/studio">
          Open the studio
          <ArrowRight aria-hidden="true" size={17} />
        </Link>
      </section>
    </>
  );
}
