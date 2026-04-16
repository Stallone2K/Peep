import { z } from "zod";

import { boundedString } from "@/lib/validators/common";

export const createApiKeySchema = z.object({
  name: boundedString(1, 64),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
