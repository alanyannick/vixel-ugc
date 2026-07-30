import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";
import { StructuredData } from "@/components/marketing/structured-data";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPageMetadata({
  title: "Privacy",
  description:
    "Vixel UGC Studio privacy information for campaign data, studio sessions, provider submissions, logs, and user controls.",
  path: "/privacy",
});

const sections: LegalSection[] = [
  {
    id: "scope",
    title: "Scope",
    content: (
      <>
        <p>
          This notice describes the current Vixel UGC Studio beta. It covers
          the public website, browser-based campaign workspace, studio access
          session, and configured media-generation routes.
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
          Campaign inputs may include product names, product facts, audience,
          platform, creative selections, prompts, and reference images you
          choose to add. Do not upload confidential material or personal data
          you are not authorized to use.
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
          The beta keeps campaign planning state in your browser. You can
          export that state as a JSON file and clear it through your browser
          storage controls.
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
          pseudonymous recovery identifier, exact-input signature, provider model and
          task ID, job status, result claim, and sanitized error state. The raw
          cookies, access code, and provider secret are not written to that
          ledger.
        </p>
      </>
    ),
  },
  {
    id: "providers",
    title: "Media providers",
    content: (
      <>
        <p>
          Live generation is off unless a deployment explicitly enables it.
          When you approve and submit a media job, the exact prompt, selected
          model settings, and approved references are sent through the server
          to the configured provider.
        </p>
        <p>
          Provider credentials stay on the server. Provider handling and
          retention are also governed by the provider terms selected by the
          deployment operator. This hosted beta keeps provider submission
          disabled until a secure provider and isolated ledger are configured.
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
          Clear site cookies in your browser to remove the local recovery
          credential.
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
        introduction="A plain-language account of what the current beta keeps in your browser, what reaches a configured provider, and what remains under your control."
        updated="July 31, 2026"
        updatedIso="2026-07-31"
        sections={sections}
      />
    </>
  );
}
