import type { Metadata } from "next";

import { AdminWaitlist } from "@/components/admin/admin-waitlist";

export const metadata: Metadata = {
  title: "Vixel UGC Beta Operations",
  description: "Protected Vixel UGC waitlist and account operations.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminWaitlist />;
}
