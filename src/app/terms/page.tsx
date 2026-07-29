import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";
import { StructuredData } from "@/components/marketing/structured-data";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPageMetadata({
  title: "Terms",
  description:
    "Terms for using the Vixel KOC Studio preview, including source responsibility, generated candidates, paid providers, and acceptable use.",
  path: "/terms",
});

const sections: LegalSection[] = [
  {
    id: "preview",
    title: "Preview service",
    content: (
      <>
        <p>
          Vixel KOC Studio is currently a preview creative-production
          workspace. Features, providers, output formats, and availability may
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
          Live generation occurs only on a configured deployment after the
          required server-signed approval and durable-ledger claim. Provider
          usage may incur cost under the deployment&apos;s provider account.
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
        The preview is provided without a service-level commitment. Export
        important campaign state. We design the workflow to preserve paid
        results and support reload recovery, but preview software may still
        contain errors.
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
        introduction="The working agreement for a preview product: supply materials you can use, review every claim, and treat generated media as a candidate—not an automatic truth."
        updated="July 30, 2026"
        sections={sections}
      />
    </>
  );
}
