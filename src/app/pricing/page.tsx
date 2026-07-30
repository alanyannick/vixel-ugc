import { permanentRedirect } from "next/navigation";

type LegacyPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function redirectTarget(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) query.append(key, item);
    }
  }
  const serialized = query.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

export default async function LegacyPricingPage({
  searchParams,
}: LegacyPageProps) {
  permanentRedirect(redirectTarget("/access", await searchParams));
}
