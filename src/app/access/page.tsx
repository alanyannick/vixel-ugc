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
    "Apply for Vixel UGC, then use UGC Campaign planning, cloud recovery, billing, and readiness-gated generation after account approval.",
  path: "/access",
});

const accessRows = [
  ["Public workflow and product-truth guides", true, true],
  ["No-cost private beta application", true, true],
  ["Campaign briefs, routes, plan, and export", false, true],
  ["Supabase account and cloud campaigns", false, true],
  ["Email OTP and lifecycle notices", false, true],
  ["Stripe-hosted billing management", false, true],
  ["Live jobs when every runtime gate is ready", false, true],
] as const;

export default function AccessPage() {
  return (
    <>
      <StructuredData
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Studio access", path: "/access" },
        ])}
      />
      <PageHero
        eyebrow="Access / Private beta"
        title={
          <>
            Plan the campaign.
            <br />
            <em>Generate when enabled.</em>
          </>
        }
        body="Apply with one product and a real campaign goal. Approved accounts can plan, save, export, manage billing, and submit media only when every live-generation gate is ready."
        aside={
          <div className="access-note">
            <span>Current release</span>
            <strong>Application + approved account beta</strong>
            <p>Manual approval · provider work stays separately gated.</p>
          </div>
        }
      />

      <section className="access-section paper-section">
        <header className="access-intro">
          <span className="section-label section-label--ink">Choose the surface</span>
          <h2>One application. One approved workspace.</h2>
          <p>
            Start with a no-cost beta application. Once approved, sign in by
            email OTP to plan, recover cloud campaigns, manage billing, and use
            eligible generation paths.
          </p>
        </header>

        <div className="access-options">
          <article>
            <div className="access-option-title">
              <span>01 / Apply</span>
              <h3>Private beta application</h3>
            </div>
            <p>
              Share one product, your campaign goal, and expected volume. We
              review access manually; applying never starts billing or paid
              media generation.
            </p>
            <strong>No charge · no provider job</strong>
            <Link className="button button--ink" href="/waitlist">
              Apply with a product brief
              <ArrowRight aria-hidden="true" size={17} />
            </Link>
          </article>
          <article>
            <div className="access-option-title">
              <span>02 / Approved account</span>
              <h3>Cloud campaign workspace</h3>
            </div>
            <p>
              Sign in by email OTP, recover account-scoped campaigns, and
              manage a Stripe subscription. Live media work opens only when
              the provider, approval, ledger, quota, and runtime checks pass.
            </p>
            <strong>Manual approval · features enabled separately</strong>
            <Link className="button button--outline-ink" href="/studio">
              Sign in to the Studio
              <ArrowRight aria-hidden="true" size={17} />
            </Link>
          </article>
        </div>

        <div className="access-matrix" role="table" aria-label="Studio access comparison">
          <div className="access-row access-row--head" role="row">
            <span role="columnheader">Capability</span>
            <span role="columnheader">Before approval</span>
            <span role="columnheader">Approved account</span>
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
                    <Minus aria-hidden="true" size={17} /> Not included
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
            Paid submission requires an approved account, active billing
            entitlement, healthy provider and ledger, runtime readiness, and
            database-enforced daily caps.
          </p>
        </div>
      </section>
    </>
  );
}
