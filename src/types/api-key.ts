// Shape returned by GET /api/dashboard/api-keys and the initial
// server-rendered page. Matches ApiKey table minus the hash.
export type ApiKeyListItem = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

// Shape returned by POST /api/dashboard/api-keys — includes the
// plaintext once and only once.
export type CreatedApiKey = ApiKeyListItem & {
  plaintext: string;
};
