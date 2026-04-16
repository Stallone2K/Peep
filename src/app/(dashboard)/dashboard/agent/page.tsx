import { Bot } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Agent" };

export default function AgentPage() {
  return (
    <ComingSoon
      title="Agent"
      description="Autonomous Multi-Page Extraction — Give A Goal, Peep Navigates And Collects."
      phase="Later Phase (Research Preview)"
      icon={Bot}
    />
  );
}
