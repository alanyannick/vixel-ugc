import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";
import { StructuredData } from "@/components/marketing/structured-data";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPageMetadata({
  title: "Privacy",
  description:
    "Vixel UGC privacy information for waitlist applications, accounts, cloud campaigns, billing, provider submissions, logs, and user controls.",
  path: "/privacy",
});

const sections: LegalSection[] = [
  {
    id: "scope",
    title: "Scope",
    content: (
      <>
        <p>
          This notice describes the current Vixel UGC beta. It covers
          the public website, Turnstile-protected waitlist, email OTP account
          access, browser and cloud campaign workspaces, lifecycle email,
          Stripe billing, and configured media-generation routes.
        </p>
        <p>
          A privately configured deployment may have an additional operator
          policy. When that policy differs, the deployment operator should make
          the difference clear before use.
        </p>
      </>
    ),
  },
  {
    id: "data",
    title: "Data we handle",
    content: (
      <>
        <p>
          A waitlist application may include your email address, name, company,
          expected volume, product link, campaign idea, referral source, and
          optional product-update preference. Account records include the
          Supabase user identifier, normalized email, approval status, and
          application role needed to control access.
        </p>
        <p>
          Campaign inputs may include product names, product facts, audience,
          platform, creative selections, prompts, reference images, plans, and
          candidates you choose to add. Do not upload confidential material or
          personal data you are not authorized to use.
        </p>
        <p>
          The service may also handle technical information needed to operate
          safely, including session state, request timing, provider task IDs,
          error status, and security-relevant logs.
        </p>
      </>
    ),
  },
  {
    id: "storage",
    title: "Storage and sessions",
    content: (
      <>
        <p>
          The planning demo keeps campaign state in your browser. You can
          export that state as a JSON file and clear it through browser storage
          controls. When cloud campaigns are enabled, authenticated campaign
          snapshots are also stored in the Supabase-backed product database
          and scoped to the current account.
        </p>
        <p>
          When studio access protection is configured, the server uses an
          HttpOnly seven-day session cookie and a separate signed,
          pseudonymous recovery cookie that can remain in the browser for up
          to twelve months. The recovery cookie lets the same browser find
          prior paid jobs after logout and re-login; neither cookie is used for
          advertising tracking.
        </p>
        <p>
          A live-generation deployment also keeps a durable media ledger with a
          pseudonymous recovery identifier, exact-input signature, provider
          model and task ID, job status, result claim, and sanitized error
          state. The raw cookies, access code, and provider secret are not
          written to that ledger.
        </p>
      </>
    ),
  },
  {
    id: "providers",
    title: "Service providers",
    content: (
      <>
        <p>
          Vixel UGC uses configured service providers for specific
          functions: Supabase for account authentication and hosted database
          infrastructure, an email provider for OTP and lifecycle messages,
          Cloudflare Turnstile for abuse prevention, and Stripe for hosted
          checkout and subscription management. These providers process the
          information needed to perform their role under their own applicable
          terms and retention practices.
        </p>
        <p>
          Live generation remains off unless the deployment explicitly enables
          it and every account, billing, provider, ledger, and runtime-health
          gate passes. When you approve and separately submit a media job, the
          exact prompt, selected model settings, and approved references are
          sent through the server to the configured NewAPI media provider.
          Provider credentials stay on the server; provider handling and
          retention are also governed by that provider&apos;s terms.
        </p>
      </>
    ),
  },
  {
    id: "controls",
    title: "Your controls",
    content: (
      <ul>
        <li>Review exact paid inputs before submission.</li>
        <li>Export campaign state for your own records.</li>
        <li>Clear local campaign data through browser controls.</li>
        <li>
          Use the unsubscribe control in optional product-update messages;
          operational account and access messages are handled separately.
        </li>
        <li>
          Clear site cookies in your browser to remove the local recovery
          credential.
        </li>
        <li>
          Ask the service operator to access, correct, or delete server-held
          account and campaign data where applicable.
        </li>
        <li>Do not adopt a generated candidate you do not want to use.</li>
      </ul>
    ),
  },
  {
    id: "changes",
    title: "Changes to this notice",
    content: (
      <p>
        We will update this page when the product changes how it stores,
        transmits, or controls data. The date at the top shows the current
        version.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <>
      <StructuredData
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Privacy", path: "/privacy" },
        ])}
      />
      <LegalPage
        label="Trust / Privacy"
        title="Privacy notice"
        introduction="A plain-language account of what the current beta stores for waitlist, account, cloud campaign, billing, and media workflows—and what remains under your control."
        updated="August 1, 2026"
        updatedIso="2026-08-01"
        sections={sections}
      />
    </>
  );
}
