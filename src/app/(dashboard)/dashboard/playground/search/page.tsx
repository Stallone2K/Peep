import { Search } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Search — Playground" };

export default function SearchPlaygroundPage() {
  return (
    <ComingSoon
      title="Search The Web"
      description="Query The Web And Pull Full Markdown From Each Result In One Call."
      phase="Phase 7 (/search Endpoint)"
      icon={Search}
    />
  );
}
