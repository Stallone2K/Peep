import { Sparkles } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Interact — Playground" };

export default function InteractPlaygroundPage() {
  return (
    <ComingSoon
      title="Interact With A Page"
      description="Chain Actions — Click, Wait, Scroll, Fill — Before Scraping The Final State."
      phase="Phase 4 (Playwright Actions)"
      icon={Sparkles}
    />
  );
}
