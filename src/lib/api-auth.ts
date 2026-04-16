import { extractBearer, verifyApiKey } from "@/lib/api-key";
import { InvalidApiKeyError } from "@/lib/errors";

// Pulls a Bearer token off the Authorization header, verifies it
// against the ApiKey table, and returns the owning userId + apiKeyId.
// Throws InvalidApiKeyError for any failure — callers wrap in toJsonError().
export async function requireApiKey(req: Request): Promise<{
  userId: string;
  apiKeyId: string;
}> {
  const raw = extractBearer(req.headers.get("authorization"));
  if (!raw) throw new InvalidApiKeyError();
  return verifyApiKey(raw);
}
