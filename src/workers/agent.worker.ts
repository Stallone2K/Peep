import { Worker, Job } from "bullmq";

import { db } from "@/lib/db";
import { getRedisConnection } from "@/lib/queue";
import { runAgentHarvest, type AgentStep } from "@/server/agent/harvester";
import { agentProgressKey, type AgentJobData } from "@/server/agent-service";

const CONCURRENCY = Number(process.env.AGENT_CONCURRENCY ?? "1");

export function startAgentWorker() {
  const worker = new Worker<AgentJobData>(
    "agent",
    async (job: Job<AgentJobData>) => {
      const { agentJobId, input } = job.data;
      const redis = getRedisConnection();
      const key = agentProgressKey(agentJobId);
      const steps: AgentStep[] = [];

      await db.extractJob.update({
        where: { id: agentJobId },
        data: { status: "RUNNING", startedAt: new Date() },
      });

      try {
        const result = await runAgentHarvest(input, (s) => {
          steps.push(s);
          // Live step trace for the polling UI (fire-and-forget).
          void redis
            .set(
              key,
              JSON.stringify({ status: "running", steps }),
              "EX",
              3600,
            )
            .catch(() => {});
        });

        await db.extractJob.update({
          where: { id: agentJobId },
          data: {
            status: "DONE",
            completedAt: new Date(),
            result: result as never,
          },
        });
        await redis
          .set(
            key,
            JSON.stringify({
              status: "done",
              steps: result.steps,
              fields: result.fields,
              recordCount: result.totalRecords,
              records: result.records.slice(0, 500),
            }),
            "EX",
            3600,
          )
          .catch(() => {});
        return { success: true, agentJobId };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.extractJob
          .update({
            where: { id: agentJobId },
            data: { status: "FAILED", error: msg, completedAt: new Date() },
          })
          .catch(() => {});
        await redis
          .set(
            key,
            JSON.stringify({ status: "failed", steps, error: msg }),
            "EX",
            3600,
          )
          .catch(() => {});
        throw err;
      }
    },
    { connection: getRedisConnection(), concurrency: CONCURRENCY },
  );

  worker.on("failed", (job, err) => {
    console.error(`[agent-worker] Job ${job?.id} failed:`, err.message);
  });
  worker.on("completed", (job) => {
    console.log(`[agent-worker] Job ${job.id} completed`);
  });

  console.log(`[agent-worker] Started with concurrency=${CONCURRENCY}`);
  return worker;
}
