import type { Metadata } from "next";

import { AccessGate } from "@/components/studio/access-gate";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { getServerRuntimeConfig } from "@/lib/server/env";

export const metadata: Metadata = {
  title: "UGC Campaign",
  description:
    "Vixel UGC's source-grounded UGC Campaign planning workspace. Live media submission is available only on enabled deployments.",
  robots: { index: false, follow: false },
};

export default function StudioPage() {
  const runtime = getServerRuntimeConfig();
  const paidGenerationReady = Boolean(
    runtime.liveGeneration &&
      runtime.newApi.configured &&
      runtime.databaseConfigured &&
      runtime.product.features.accountAuth.ready &&
      runtime.product.features.billing.ready,
  );

  return (
    <AccessGate>
      <StudioWorkspace
        capabilities={{
          paidGenerationReady,
          liveGenerationEnabled: runtime.liveGeneration,
          accountAuthEnabled:
            runtime.product.features.accountAuth.enabled,
          creativeBriefReady:
            runtime.product.features.creativeBrief.ready,
          cloudCampaignsReady:
            runtime.product.features.cloudCampaigns.ready,
          billingReady: runtime.product.features.billing.ready,
        }}
      />
    </AccessGate>
  );
}
