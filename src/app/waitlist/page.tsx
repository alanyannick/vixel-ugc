import type { Metadata } from "next";
import { ShieldCheck, Sparkles } from "lucide-react";

import { StructuredData } from "@/components/marketing/structured-data";
import { WaitlistForm } from "@/components/waitlist/waitlist-form";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPageMetadata({
  title: "Join the private beta",
  description:
    "Join the Vixel UGC private beta for source-grounded UGC Campaign planning, cloud campaigns, and eligible reviewed video generation.",
  path: "/waitlist",
});

type WaitlistPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function single(
  value: string | string[] | undefined,
  maximum: number,
): string {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.slice(0, maximum) ?? "";
}

export default async function WaitlistPage({
  searchParams,
}: WaitlistPageProps) {
  const query = await searchParams;
  return (
    <>
      <StructuredData
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Join beta", path: "/waitlist" },
        ])}
      />
      <section className="waitlist-page">
        <div className="waitlist-copy">
          <p>PRIVATE BETA / APPLICATION</p>
          <h1>
            Bring one product.
            <br />
            <em>Apply with a real brief.</em>
          </h1>
          <span>
            Tell us what you make and how much creator content you need. We
            review access manually so early teams get a reliable workflow.
          </span>
          <ul>
            <li>
              <Sparkles aria-hidden="true" size={18} />
              Source-grounded hooks and production plans
            </li>
            <li>
              <ShieldCheck aria-hidden="true" size={18} />
              No charge and no paid generation on submission
            </li>
          </ul>
        </div>
        <WaitlistForm
          initialIntent={single(query.intent, 500)}
          initialProductUrl={single(query.productUrl, 512)}
          source={single(query.source, 120) || "waitlist-page"}
        />
      </section>
    </>
  );
}
