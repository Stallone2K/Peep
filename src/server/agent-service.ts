import { db } from "@/lib/db";
import { debitCredits } from "@/lib/credits";
import { agentQueue, getRedisConnection } from "@/lib/queue";
import type { AgentRequestInput } from "@/lib/validators/agent";

// Agent jobs reuse the ExtractJob table (integration = "agent") so we avoid a
// schema migration: task → prompt, output → result, sources → urls.

export type AgentJobData = { agentJobId: string; input: AgentRequestInput };

export async function startAgentJob({
  userId,
  apiKeyId,
  input,
}: {
  userId: string;
  apiKeyId: string | null;
  input: AgentRequestInput;
}): Promise<{ jobId: string; creditsReserved: number }> {
  // Budget: ~1 credit per source scraped + a planning/extraction surcharge.
  const creditsNeeded = input.maxSources + 4;
  await debitCredits(userId, creditsNeeded, {
    reason: "agent",
    refType: "AgentJob",
  });

  const job = await db.extractJob.create({
    data: {
      userId,
      apiKeyId,
      urls: input.urls ?? [],
      prompt: input.prompt,
      schema: (input.schema as never) ?? undefined,
      enableWebSearch: false,
      status: "QUEUED",
      creditsUsed: creditsNeeded,
      integration: "agent",
    },
  });

  const jobData: AgentJobData = { agentJobId: job.id, input };
  await agentQueue().add(`agent-${job.id}`, jobData, { jobId: job.id });

  return { jobId: job.id, creditsReserved: creditsNeeded };
}

// Live progress (step trace + partial records) is written to Redis by the
// worker; the polling status route reads it.
export function agentProgressKey(jobId: string): string {
  return `agent:progress:${jobId}`;
}

export async function readAgentProgress(
  jobId: string,
): Promise<Record<string, unknown> | null> {
  const raw = await getRedisConnection()
    .get(agentProgressKey(jobId))
    .catch(() => null);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}
