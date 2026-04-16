import { Settings } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <ComingSoon
      title="Settings"
      description="Profile, Billing, Team Members, Webhook Signing Secrets, And Danger-Zone Account Controls."
      phase="Phase 9 (Billing + Observability)"
      icon={Settings}
    />
  );
}
