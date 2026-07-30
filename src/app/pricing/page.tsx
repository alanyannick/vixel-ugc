import { permanentRedirect } from "next/navigation";

export default function LegacyPricingPage() {
  permanentRedirect("/access");
}
