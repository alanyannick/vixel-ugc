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
    "Answers about Vixel UGC, AI UGC and KOC, product claims, accounts, billing, live generation, campaign storage, and provider data.",
  path: "/faq",
});

const faqItems = [
  {
    id: "what-is-vixel",
    question: "What is Vixel UGC?",
    answer:
      "Vixel UGC is an AI UGC Ad Studio. It turns source-backed product facts into five creative routes, one reviewed UGC Campaign plan, eligible paid media jobs, and traceable candidates. The Creative Router coordinates the path behind one workflow.",
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
      "Selecting a route does not start generation. A live submission requires an approved account, active server-verified billing entitlement, enabled secure provider, healthy isolated ledger and runtime, available quota, and a current exact-input approval. You first lock the input without provider spend, then separately confirm one potentially billable submission.",
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
      "The planning demo keeps campaign state in the browser and supports JSON export. When cloud campaigns are enabled, an authenticated campaign snapshot is stored in the Supabase-backed product database and scoped to the current account. Paid-job status and result claims use a separate private PostgreSQL ledger with a signed recovery identity. Provider credentials never reach the browser.",
  },
  {
    id: "accounts",
    question: "How do accounts and beta approval work?",
    answer:
      "When account access is enabled, sign-in uses a one-time code sent by email through the configured Supabase and email setup. Authentication and approval are separate: a valid OTP creates or restores the account session, while an operator-controlled account status determines whether the private Studio opens.",
  },
  {
    id: "waitlist",
    question: "What happens when I join the waitlist?",
    answer:
      "The hosted form uses Turnstile to reduce automated abuse and records your application for operator review. Submitting it does not start a subscription, trigger paid generation, or guarantee approval. Optional product updates require a separate unchecked consent choice; access and account emails are operational messages.",
  },
  {
    id: "billing",
    question: "How does subscription billing work?",
    answer:
      "When billing is enabled, checkout and billing management are hosted by Stripe. The server grants entitlement only from a verified active or trialing subscription projection. A subscription does not bypass account approval, exact-input review, provider availability, ledger readiness, quota, or runtime-health checks.",
  },
  {
    id: "outputs",
    question: "What does the current workflow generate?",
    answer:
      "The Creative Router coordinates five hook routes and three creator personas. In a fully enabled Studio, the media workflow can produce one reviewed visual anchor and a 9:16 video candidate with a 4, 6, or 8-second duration.",
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
      "No. Vixel UGC is an independently operated web product and is not affiliated with third-party mobile applications using a similar name.",
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
        <h2>See the full campaign workflow before you apply.</h2>
        <Link className="button button--citron" href="/workflows/ugc-video">
          Read the workflow
          <ArrowRight aria-hidden="true" size={17} />
        </Link>
      </section>
    </>
  );
}
