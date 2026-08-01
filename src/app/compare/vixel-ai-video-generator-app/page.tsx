import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { StructuredData } from "@/components/marketing/structured-data";
import { articleSchema, breadcrumbSchema, faqSchema } from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";

const path = "/compare/vixel-ai-video-generator-app";
const appStoreUrl =
  "https://apps.apple.com/us/app/vixel-ai-video-generator/id6756965785";
const description =
  "Compare the Vixel iPhone app from FENIX MOBILE YAZILIM A.S. with Vixel Campaigns, an independent account-based web studio for grounded UGC campaigns.";

export const metadata: Metadata = createPageMetadata({
  title: "Vixel AI Video Generator app comparison",
  description,
  path,
});

const comparisonFaq = [
  {
    question:
      "Is Vixel Campaigns affiliated with the Vixel AI Video Generator iPhone app?",
    answer:
      "No. Vixel Campaigns at ugc.vixelai.com is an independently operated web product. It is not affiliated with, endorsed by, or operated by FENIX MOBILE YAZILIM A.S., the developer of the iPhone app “Vixel – AI Video Generator.”",
  },
  {
    question: "Is this website the official web version of the iPhone app?",
    answer:
      "No. This website is not a web version, account portal, support site, or download page for the iPhone app. The official public listing for that app is available on Apple’s App Store.",
  },
  {
    question: "What does the iPhone app say it is designed to do?",
    answer:
      "Its public App Store listing describes a general-purpose iPhone experience for text-to-video, image-to-video, photo animation, character animation, effects, and short-form video creation. Vixel Campaigns has not independently tested or verified those claims.",
  },
  {
    question: "What does Vixel Campaigns do today?",
    answer:
      "Vixel Campaigns is an account-based private beta for source-grounded product-to-UGC campaigns. It structures product facts, Creative Router directions, exact media inputs, and campaign exports. Approved accounts can use account-scoped cloud campaign persistence when that deployment capability is ready, with browser recovery as a fallback. Paid media submission stays disabled unless account, subscription, provider, deployment, and ledger readiness all pass.",
  },
  {
    question: "Does opening Vixel Campaigns start paid generation?",
    answer:
      "No. Joining the waitlist, planning a campaign, saving it to the cloud, or selecting a creative route does not submit a paid media job. A ready deployment requires a separate review and explicit approval of the exact prompt, references, model, format, duration, and audio settings before submission.",
  },
] as const;

export default function VixelAppComparisonPage() {
  return (
    <>
      <StructuredData
        data={[
          articleSchema({
            headline: "Vixel Campaigns vs Vixel AI Video Generator app",
            description,
            path,
            datePublished: "2026-08-01",
            dateModified: "2026-08-01",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Vixel app vs web studio", path },
          ]),
          faqSchema(comparisonFaq),
        ]}
      />

      <PageHero
        eyebrow="Independent comparison / Identity first"
        title={
          <>
            Two products called Vixel.
            <br />
            <em>Different creative jobs.</em>
          </>
        }
        body="The iPhone app “Vixel – AI Video Generator” is published by FENIX MOBILE YAZILIM A.S. Vixel Campaigns is an independently operated web product. It is not affiliated with, endorsed by, or operated by any third-party mobile app or App Store publisher using a similar name."
        aside={
          <div className="access-note">
            <span>Source boundary</span>
            <strong>Public listing only</strong>
            <p>
              App information on this page comes from its public US App Store
              listing, checked August 1, 2026. We do not claim to have tested
              the app.
            </p>
            <a
              aria-label="View the official App Store listing for Vixel AI Video Generator"
              className="text-link text-link--light"
              href={appStoreUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              View the official App Store listing
              <ExternalLink aria-hidden="true" size={15} />
            </a>
          </div>
        }
      />

      <section className="access-section paper-section">
        <header className="access-intro">
          <span className="section-label section-label--ink">
            Similar name, separate products
          </span>
          <h2>Choose by the work you need to do.</h2>
          <p>
            This is a source-based identity and use-case comparison, not a
            performance review. Product names are used only to help visitors
            distinguish the two products.
          </p>
        </header>

        <div className="access-options">
          <article>
            <div className="access-option-title">
              <span>01 / Independent iPhone app</span>
              <h3>General AI video and photo creation</h3>
            </div>
            <p>
              The public App Store listing describes text-to-video,
              image-to-video, photo and character animation, effects, and
              short-form video creation for iPhone.
            </p>
            <strong>Published by FENIX MOBILE YAZILIM A.S.</strong>
            <a
              className="button button--outline-ink"
              href={appStoreUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Open the official listing
              <ExternalLink aria-hidden="true" size={17} />
            </a>
          </article>

          <article>
            <div className="access-option-title">
              <span>02 / Independent web studio</span>
              <h3>Grounded UGC campaign planning</h3>
            </div>
            <p>
              Vixel Campaigns organizes supplied product facts into Creative
              Router directions, reviewable media inputs, and account-scoped
              cloud campaigns, with browser and JSON recovery paths.
            </p>
            <strong>Account-based private beta at ugc.vixelai.com</strong>
            <Link className="button button--ink" href="/ugc-ad-generator">
              Explore the UGC Campaign workflow
              <ArrowRight aria-hidden="true" size={17} />
            </Link>
          </article>
        </div>
      </section>

      <section className="cost-clarity dark-section">
        <span className="section-label">What the web private beta means</span>
        <h2>
          Plan first.
          <br />
          <em>Generate only when ready.</em>
        </h2>
        <div className="cost-points">
          <p>
            <span>01</span>
            Joining the waitlist, planning, route comparison, cloud saving, and
            export do not submit a provider job.
          </p>
          <p>
            <span>02</span>
            Approved accounts can keep campaigns in account-scoped cloud storage
            when ready, with browser recovery and JSON export as fallbacks.
          </p>
          <p>
            <span>03</span>
            Paid submission requires account approval, subscription entitlement,
            a ready provider, a live-generation flag, a durable ledger, and
            explicit approval of the exact input.
          </p>
          <p>
            <span>04</span>A generated result remains a candidate until it is
            reviewed and deliberately adopted into the campaign.
          </p>
        </div>
      </section>

      <section className="faq-section paper-section">
        <div className="faq-index">
          <span className="section-label section-label--ink">
            {comparisonFaq.length} direct answers
          </span>
          <p>
            Clear answers for visitors deciding whether they want the
            independently published iPhone app or this account-based web
            campaign studio.
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

      <section className="truth-policy dark-section">
        <div>
          <span className="section-label">No affiliation</span>
          <h2>
            Identification,
            <br />
            <em>not association.</em>
          </h2>
        </div>
        <ul>
          <li>
            Vixel Campaigns is not affiliated with, endorsed by, or operated by
            FENIX MOBILE YAZILIM A.S.
          </li>
          <li>
            The iPhone app name is used only to identify the separate product
            described by its public App Store listing.
          </li>
          <li>
            This website is not the app&apos;s web version, account portal,
            download page, customer support site, or subscription manager.
          </li>
          <li>
            No third-party logo, screenshot, rating, review, price, or App Store
            badge is used on this page.
          </li>
        </ul>
        <a
          className="text-link text-link--light"
          href={appStoreUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Continue to the official App Store listing
          <ExternalLink aria-hidden="true" size={15} />
        </a>
      </section>

      <FinalCta
        eyebrow="Need a campaign workspace rather than a general-purpose clip?"
        title="Start with product truth and a reviewable Creative Router direction."
        body="The account-based beta can plan, save, and export a UGC Campaign without provider spend. Paid media remains gated by entitlement, deployment readiness, and exact-input approval."
      />
    </>
  );
}
