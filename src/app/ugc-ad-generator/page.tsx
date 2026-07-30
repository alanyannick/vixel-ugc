import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleDotDashed } from "lucide-react";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { StructuredData } from "@/components/marketing/structured-data";
import { breadcrumbSchema, faqSchema } from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";

const path = "/ugc-ad-generator";
const description =
  "Build source-grounded AI UGC video ads from approved product facts, creative routes, exact paid-input review, and traceable generated candidates.";

export const metadata: Metadata = createPageMetadata({
  title: "AI UGC ad generator for product videos",
  description,
  path,
});

const generatorFaq = [
  {
    question: "What is an AI UGC ad generator?",
    answer:
      "An AI UGC ad generator turns a product brief, creative direction, and visual references into creator-style advertising media with generative AI. Generated talent should not be represented as a real customer's unscripted endorsement.",
  },
  {
    question: "What does Vixel need before it can build a UGC ad?",
    answer:
      "Vixel starts with supplied product facts, supported benefits, audience, platform, campaign goal, and visual references. You then choose a hook and creator direction before reviewing the exact media input.",
  },
  {
    question: "What video settings can I review?",
    answer:
      "The current workflow exposes the prompt, ordered references, model, 9:16 aspect ratio, 4, 6, or 8-second duration, resolution, and audio setting before a configured deployment submits paid generation.",
  },
  {
    question: "Does choosing a creative route start paid generation?",
    answer:
      "No. Route selection and campaign planning do not submit a provider job. Paid generation requires a configured deployment and explicit approval of the exact input; changing that input requires a fresh approval.",
  },
  {
    question: "Does Vixel promise ad performance?",
    answer:
      "No. Vixel helps structure and produce reviewable creator-style ad candidates. It does not promise conversion, reach, or other campaign outcomes.",
  },
] as const;

export default function UgcAdGeneratorPage() {
  return (
    <>
      <StructuredData
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "AI UGC ad generator", path },
          ]),
          faqSchema(generatorFaq),
        ]}
      />

      <PageHero
        eyebrow="Product / AI UGC ad generator"
        title={
          <>
            Build creator-style product ads
            <br />
            from <em>approved facts.</em>
          </>
        }
        body="Vixel turns a source-backed product brief into distinct creative routes, a reviewable production plan, and traceable AI-generated media candidates."
        aside={
          <ol className="page-hero-index">
            <li>
              <span>01</span> Five hook routes
            </li>
            <li>
              <span>02</span> Three creator directions
            </li>
            <li>
              <span>03</span> 4, 6, or 8 seconds
            </li>
            <li>
              <span>04</span> 9:16 with audio
            </li>
          </ol>
        }
      />

      <section className="decision-gates paper-section">
        <header>
          <span className="section-label section-label--ink">
            From brief to candidate
          </span>
          <h2>A generator with decisions you can inspect.</h2>
        </header>
        <div className="gate-list">
          <article>
            <span>01</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>Ground the brief</h3>
            <p>
              Separate visible facts, supported benefits, creator expression,
              and unsupported claims before writing the ad.
            </p>
          </article>
          <article>
            <span>02</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>Choose the angle</h3>
            <p>
              Compare hook and creator directions, then select the route that
              fits the audience, platform, and campaign goal.
            </p>
          </article>
          <article>
            <span>03</span>
            <CircleDotDashed aria-hidden="true" size={22} />
            <h3>Approve the input</h3>
            <p>
              Review the exact prompt, references, model, format, duration, and
              audio before any configured paid generation begins.
            </p>
          </article>
        </div>
        <Link className="text-link text-link--ink" href="/workflows/ugc-video">
          See the complete AI UGC workflow
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <section className="truth-policy dark-section">
        <div>
          <span className="section-label">Built for review, not imitation</span>
          <h2>
            Creator-style media
            <br />
            is <em>not a customer claim.</em>
          </h2>
        </div>
        <ul>
          <li>Keep product statements tied to supplied evidence.</li>
          <li>Do not present generated talent as a real customer or KOC.</li>
          <li>Treat every generated result as a candidate until it is adopted.</li>
          <li>Preserve the approved input and delivery receipt with the work.</li>
        </ul>
        <Link className="text-link text-link--light" href="/product-truth">
          Read the product truth standard
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <section className="faq-section paper-section">
        <div className="faq-index">
          <span className="section-label section-label--ink">
            {generatorFaq.length} direct answers
          </span>
          <p>
            These answers describe the current workflow without implying a
            customer endorsement or guaranteed campaign result.
          </p>
        </div>
        <div className="faq-list">
          {generatorFaq.map((item, index) => (
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
        eyebrow="Start with one grounded product brief."
        title="Turn approved facts into a reviewable UGC ad candidate."
        body="Open the studio with the demo campaign, or bring your own product facts, references, audience, and campaign goal."
      />
    </>
  );
}
