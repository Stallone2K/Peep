import { AgentPlayground } from "@/components/dashboard/agent-playground";

export const metadata = { title: "Agent — Research Preview" };

// Auth is enforced by the dashboard layout; no top-level auth() here (it would
// break cacheComponents prerendering unless wrapped in Suspense).
export default function AgentPage() {
  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] w-full max-w-3xl flex-col px-4">
      <AgentPlayground />
    </div>
  );
}
