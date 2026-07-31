import type { Metadata } from "next";

import { AccessGate } from "@/components/studio/access-gate";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { getServerRuntimeConfig } from "@/lib/server/env";

export const metadata: Metadata = {
  title: "AI UGC Campaign Studio",
  description:
    "Build a source-grounded AI UGC campaign from product truth to reviewed media candidates.",
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
        }}
      />
    </AccessGate>
  );
}
