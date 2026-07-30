import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { StructuredData } from "@/components/marketing/structured-data";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPageMetadata({
  title: "Private beta access",
  description:
    "Explore Vixel UGC Studio access: use the complete local-first AI UGC workflow, with live generation available only on configured deployments.",
  path: "/access",
});

const accessRows = [
  ["Campaign briefs and source ledger", true, true],
  ["Five hook routes and three personas", true, true],
  ["Canonical plan and local recovery", true, true],
  ["Campaign JSON export and restore", true, true],
  ["Live image and video provider jobs", false, true],
  ["Deployment-level access control", false, true],
] as const;

export default function PricingPage() {
  return (
    <>
      <StructuredData
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Studio access", path: "/access" },
        ])}
      />
      <PageHero
        eyebrow="Access / Global private beta"
        title={
          <>
            Plan the campaign.
            <br />
            <em>Generate when enabled.</em>
          </>
        }
        body="Build and export a source-grounded UGC campaign in the beta studio. Live AI video generation is available only in enabled studios."
        aside={
          <div className="access-note">
            <span>Current release</span>
            <strong>Private beta</strong>
            <p>Limited beta access · provider usage may incur cost.</p>
          </div>
        }
      />

      <section className="access-section paper-section">
        <header className="access-intro">
          <span className="section-label section-label--ink">Choose the surface</span>
          <h2>Two ways to use the same workflow.</h2>
          <p>
            Start in local planning mode. Move to a configured studio only when
            you are ready to submit approved inputs to a media provider.
          </p>
        </header>

        <div className="access-options">
          <article>
            <div className="access-option-title">
              <span>01 / Local planning</span>
              <h3>Campaign workspace</h3>
            </div>
            <p>
              Build the brief, compare routes, inspect the plan, and export the
              campaign without a paid media request.
            </p>
            <strong>Included in beta</strong>
            <Link className="button button--ink" href="/studio">
              Open the demo
              <ArrowRight aria-hidden="true" size={17} />
            </Link>
          </article>
          <article>
            <div className="access-option-title">
              <span>02 / Configured generation</span>
              <h3>Private deployment</h3>
            </div>
            <p>
              Create a reviewed image anchor and vertical video, inspect the
              exact paid input, and keep candidate lineage through delivery.
            </p>
            <strong>Available only in enabled studios</strong>
            <Link className="button button--outline-ink" href="/faq#live-generation">
              Review live-generation rules
              <ArrowRight aria-hidden="true" size={17} />
            </Link>
          </article>
        </div>

        <div className="access-matrix" role="table" aria-label="Studio access comparison">
          <div className="access-row access-row--head" role="row">
            <span role="columnheader">Capability</span>
            <span role="columnheader">Local planning</span>
            <span role="columnheader">Configured studio</span>
          </div>
          {accessRows.map(([name, local, configured]) => (
            <div className="access-row" role="row" key={name}>
              <strong role="cell">{name}</strong>
              <span role="cell">
                {local ? (
                  <>
                    <Check aria-hidden="true" size={17} /> Included
                  </>
                ) : (
                  <>
                    <Minus aria-hidden="true" size={17} /> Not submitted
                  </>
                )}
              </span>
              <span role="cell">
                {configured ? (
                  <>
                    <Check aria-hidden="true" size={17} /> Available
                  </>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="cost-clarity dark-section">
        <span className="section-label">Cost clarity</span>
        <h2>
          Vixel shows the exact input
          <br />
          <em>before the provider sees it.</em>
        </h2>
        <div className="cost-points">
          <p>
            <span>01</span>
            No background generation merely because a route was selected.
          </p>
          <p>
            <span>02</span>
            A changed paid input invalidates the previous approval.
          </p>
          <p>
            <span>03</span>
            Ambiguous paid submissions are never auto-retried; the server ledger
            returns the existing job state.
          </p>
          <p>
            <span>04</span>
            Database-enforced daily submission caps limit provider-cost
            exposure across browsers and deployments.
          </p>
        </div>
      </section>
    </>
  );
}
