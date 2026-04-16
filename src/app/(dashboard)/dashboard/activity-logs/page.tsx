import { Activity } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Activity Logs" };

export default function ActivityLogsPage() {
  return (
    <ComingSoon
      title="Activity Logs"
      description="Every API Call Your Keys Have Made, With Status, Credits Used, And Duration."
      phase="Phase 3 (Scrape API)"
      icon={Activity}
    />
  );
}
