import type { Metadata } from "next";

import { AdminConsole } from "@/components/admin/admin-console";

export const metadata: Metadata = {
  title: "UGC Beta Operations",
  description: "Protected Vixel UGC waitlist and account operations.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminConsole />;
}
