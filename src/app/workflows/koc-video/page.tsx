import { permanentRedirect } from "next/navigation";

export default function LegacyKocWorkflowPage() {
  permanentRedirect("/workflows/ugc-video");
}
