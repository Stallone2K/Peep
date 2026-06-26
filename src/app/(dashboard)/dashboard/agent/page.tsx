import { AgentPlayground } from "@/components/dashboard/agent-playground";

export const metadata = { title: "Agent — Research Preview" };

// Auth is enforced by the dashboard layout; no top-level auth() here (it would
// break cacheComponents prerendering unless wrapped in Suspense).
export default function AgentPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-10">
      <AgentPlayground />
    </div>
  );
}
