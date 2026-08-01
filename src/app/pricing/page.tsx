import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";

import { BillingPanel } from "@/components/billing/billing-panel";
import { StructuredData } from "@/components/marketing/structured-data";
import { formatFoundingBetaPrice } from "@/lib/product-offer";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";
import { getServerRuntimeConfig } from "@/lib/server/env";

export const metadata: Metadata = createPageMetadata({
  title: "Private beta pricing",
  description:
    "Private beta pricing for source-grounded UGC Campaign planning, cloud recovery, Stripe billing, and readiness-gated image and video generation.",
  path: "/pricing",
});

const features = [
  "Source-grounded campaign briefs",
  "Five distinct creator routes",
  "Cloud campaign save and recovery",
  "Eligibility for reviewed image and video generation when enabled",
  "Exact paid-input receipts and replay protection",
  "Stripe-hosted checkout and billing management when enabled",
] as const;

export default function PricingPage() {
  const runtime = getServerRuntimeConfig();
  const billingReady = runtime.product.features.billing.ready;

  return (
    <>
      <StructuredData
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Pricing", path: "/pricing" },
        ])}
      />
      <section className="pricing-hero">
        <div>
          <p>PRICING / PRIVATE BETA</p>
          <h1>
            Plan freely.
            <br />
            <em>Generate deliberately.</em>
          </h1>
          <span>
            Waitlist and planning never trigger provider spend. An approved
            account and active recurring subscription are required before paid
            generation can run, along with provider, approval, ledger, quota,
            feature-flag, and runtime-health readiness.{" "}
            {billingReady
              ? "Billing is open for approved accounts on this deployment."
              : "Billing and Checkout are currently closed on this deployment."}
          </span>
        </div>
        <article className="pricing-card">
          <header>
            <span>
              {billingReady ? "Founding beta" : "Planned founding beta"}
            </span>
            <strong>{formatFoundingBetaPrice()} / month</strong>
            <small>
              {billingReady
                ? "Recurring monthly access. Renewal details appear in Stripe Checkout."
                : "Planned recurring price. No subscription can be purchased on this deployment yet."}
            </small>
          </header>
          <ul>
            {features.map((feature) => (
              <li key={feature}>
                <Check aria-hidden="true" size={16} />
                {feature}
              </li>
            ))}
          </ul>
          <BillingPanel enabled={billingReady} />
          <Link className="button button--outline-ink" href="/waitlist">
            Apply for beta access
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
          <p>
            <ShieldCheck aria-hidden="true" size={16} />
            {billingReady
              ? "Checkout and billing management are hosted by Stripe."
              : "Joining the waitlist does not create a subscription or charge."}
          </p>
        </article>
      </section>
    </>
  );
}
