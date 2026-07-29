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
    "Answers about Vixel KOC Studio, product claims, KOC and UGC workflows, live generation, campaign storage, and provider data.",
  path: "/faq",
});

const faqItems = [
  {
    id: "what-is-vixel",
    question: "What is Vixel KOC Studio?",
    answer:
      "Vixel is a campaign workspace for planning and producing creator-native KOC and UGC product videos. It turns source-backed product facts into five creative routes, one reviewed plan, paid media jobs, and traceable candidates.",
  },
  {
    id: "koc-vs-ugc",
    question: "What is the difference between KOC and UGC here?",
    answer:
      "Vixel uses KOC to describe credible, product-experience-led creator content and UGC as the broader creator-made format. The workflow supports both; the important boundary is that every product claim remains grounded in supplied evidence.",
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
      "Only when the deployment has live generation enabled, the user has an authenticated studio session, and the exact paid input has been approved. Selecting a route by itself does not submit a provider job.",
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
      "In the current preview, campaign planning state is kept in the browser and can be exported as JSON. Inputs submitted for generation pass through the server to the configured provider; provider credentials are never sent to the browser.",
  },
  {
    id: "late-results",
    question: "What happens to late provider results?",
    answer:
      "They are preserved as protected candidates with their lineage. A late result is never silently adopted into the campaign.",
  },
  {
    id: "export",
    question: "Can I export and restore a campaign?",
    answer:
      "Yes. The campaign can be exported as a structured JSON file and restored later, including product facts, selected route, plan state, and available receipts.",
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
        body="How the router behaves, when paid work starts, what gets stored, and why candidates never rewrite campaign truth."
        aside={
          <div className="faq-aside">
            <span>Need the sequence?</span>
            <Link href="/workflows/koc-video">
              Read the four-stage workflow
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
        }
      />

      <section className="faq-section paper-section">
        <div className="faq-index">
          <span className="section-label section-label--ink">Eight answers</span>
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
