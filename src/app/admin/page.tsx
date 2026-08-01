import type { Metadata } from "next";

import { AdminWaitlist } from "@/components/admin/admin-waitlist";

export const metadata: Metadata = {
  title: "Vixel Campaigns Beta Operations",
  description: "Protected Vixel Campaigns waitlist and account operations.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminWaitlist />;
}
