import type { Metadata } from "next";

import { AccessGate } from "@/components/studio/access-gate";
import { StudioWorkspace } from "@/components/studio/studio-workspace";

export const metadata: Metadata = {
  title: "AI UGC Campaign Studio",
  description:
    "Build a source-grounded AI UGC campaign from product truth to reviewed media candidates.",
  robots: { index: false, follow: false },
};

export default function StudioPage() {
  return (
    <AccessGate>
      <StudioWorkspace />
    </AccessGate>
  );
}
