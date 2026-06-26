import { z } from "zod";

import { boundedString } from "@/lib/validators/common";

// POST /api/v1/agent — the lead/data harvesting agent. Describe a task in
// natural language; the agent plans search queries + a target schema, fans
// out across the web (search → scrape → extract), dedupes, and returns a flat
// table of records. A Peep-original (FIRE-1-style) endpoint.

export const agentRequestSchema = z.object({
  // The task, e.g. "flats for rent in Vivek Vihar with owner phone numbers".
  prompt: boundedString(1, 2_000),

  // Optional explicit output schema; if omitted the planner infers the fields.
  schema: z.any().optional(),

  // Optional seed URLs/sites to prioritise (the agent still searches too).
  urls: z.array(z.string().url()).max(20).optional(),

  // Density controls (budgeted so a run can't go infinite).
  targetRecords: z.number().int().positive().max(500).default(50),
  maxSources: z.number().int().positive().max(60).default(20),

  // Locale hints for search.
  country: z.string().length(2).optional(),
  lang: z.string().max(10).optional(),

  integration: z.string().max(64).optional(),
});

export type AgentRequestInput = z.infer<typeof agentRequestSchema>;
