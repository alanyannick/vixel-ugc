import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";
import { StructuredData } from "@/components/marketing/structured-data";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPageMetadata({
  title: "Terms",
  description:
    "Terms for using the Vixel Campaigns beta, including account access, source responsibility, subscriptions, generated candidates, and acceptable use.",
  path: "/terms",
});

const sections: LegalSection[] = [
  {
    id: "beta",
    title: "Beta service",
    content: (
      <>
        <p>
          Vixel Campaigns is currently a beta AI Product-to-UGC Campaign
          Studio. Features, providers, output formats, and availability may
          change as the product matures.
        </p>
        <p>
          The service helps structure and generate creative work; it does not
          automatically publish content or replace your legal, advertising,
          brand, or platform review.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and access",
    content: (
      <>
        <p>
          When account access is enabled, sign-in uses a one-time code sent to
          your email address. You are responsible for keeping that email
          account and your authenticated session secure.
        </p>
        <p>
          Authentication does not guarantee beta admission. Studio access may
          require operator approval and may be suspended for abuse, security
          risk, nonpayment, or a violation of these terms. Do not share access,
          impersonate another account, or bypass an approval gate.
        </p>
      </>
    ),
  },
  {
    id: "responsibility",
    title: "Your sources and instructions",
    content: (
      <>
        <p>
          You are responsible for having the right to use the product
          information, images, creator references, trademarks, and other
          materials you submit.
        </p>
        <p>
          You must review product claims and generated media before use. Do not
          use the service to misrepresent an endorsement, fabricate material
          product evidence, or violate another person&apos;s privacy or
          publicity rights.
        </p>
      </>
    ),
  },
  {
    id: "generation",
    title: "Generation and provider cost",
    content: (
      <>
        <p>
          Live generation can occur only after an approved account has an
          active server-verified billing entitlement and the deployment passes
          its provider, exact-input approval, ledger, quota, feature-flag, and
          runtime-health checks. A media submission consumes potentially
          billable provider capacity.
        </p>
        <p>
          Generated outputs can be unpredictable. A candidate may be
          incomplete, unsuitable, inaccurate, or restricted by a provider. The
          workflow keeps candidates reviewable; it does not guarantee that an
          output is safe or lawful to publish.
        </p>
      </>
    ),
  },
  {
    id: "billing",
    title: "Subscription billing",
    content: (
      <>
        <p>
          When billing is enabled, recurring checkout and subscription
          management are hosted by Stripe. The price, renewal cadence, taxes,
          and cancellation terms shown during Stripe Checkout or in the
          billing portal apply to that subscription.
        </p>
        <p>
          Only a verified <code>active</code> or <code>trialing</code>
          subscription status grants server-side entitlement. Entitlement does
          not guarantee that a media provider is available, that a particular
          output will succeed, or that every live-generation gate has passed.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    content: (
      <p>
        Do not use the service to create unlawful, deceptive, abusive, or
        infringing material; probe or bypass access controls; extract provider
        credentials; submit malicious files; or interfere with the service or
        other users.
      </p>
    ),
  },
  {
    id: "availability",
    title: "Availability and recovery",
    content: (
      <p>
        The beta is provided without a service-level commitment. Export
        important campaign state. We design the workflow to preserve paid
        results and support reload recovery, but beta software may still
        contain errors. This independently operated web studio is not affiliated
        with third-party mobile applications using a similar name.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    content: (
      <p>
        We may update these terms when product behavior or provider support
        changes. Continued use after an update means you accept the revised
        terms.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <>
      <StructuredData
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Terms", path: "/terms" },
        ])}
      />
      <LegalPage
        label="Trust / Terms"
        title="Terms of use"
        introduction="The working agreement for a beta product: supply materials you can use, review every claim, and treat generated media as a candidate—not an automatic truth."
        updated="August 1, 2026"
        updatedIso="2026-08-01"
        sections={sections}
      />
    </>
  );
}
