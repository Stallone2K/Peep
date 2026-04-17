import { Worker, Job } from "bullmq";

import { getRedisConnection } from "@/lib/queue";
import {
  runExtractJob,
  type ExtractJobData,
} from "@/server/extract-service";

const CONCURRENCY = Number(process.env.EXTRACT_CONCURRENCY ?? "2");

export function startExtractWorker() {
  const worker = new Worker<ExtractJobData>(
    "extract",
    async (job: Job<ExtractJobData>) => {
      const { extractJobId, input } = job.data;
      await runExtractJob(extractJobId, input);
      return { success: true, extractJobId };
    },
    {
      connection: getRedisConnection(),
      concurrency: CONCURRENCY,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[extract-worker] Job ${job?.id} failed:`,
      err.message,
    );
  });

  worker.on("completed", (job) => {
    console.log(`[extract-worker] Job ${job.id} completed`);
  });

  console.log(
    `[extract-worker] Started with concurrency=${CONCURRENCY}`,
  );
  return worker;
}
