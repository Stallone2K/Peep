import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { AgentPlayground } from "@/components/dashboard/agent-playground";

export const metadata = { title: "Agent — Research Preview" };

export default async function AgentPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-10">
      <AgentPlayground />
    </div>
  );
}
