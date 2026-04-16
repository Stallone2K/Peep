import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApiKeysManager } from "@/components/dashboard/api-keys-manager";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiKeyListItem } from "@/types/api-key";

export const metadata = {
  title: "API Keys",
};

export default function ApiKeysPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <Suspense fallback={<ApiKeysSkeleton />}>
        <ApiKeysManagerServer />
      </Suspense>
    </div>
  );
}

async function ApiKeysManagerServer() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const rows = await db.apiKey.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      lastUsedAt: true,
      createdAt: true,
      revokedAt: true,
    },
  });

  const initialKeys: ApiKeyListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
  }));

  return <ApiKeysManager initialKeys={initialKeys} />;
}

function ApiKeysSkeleton() {
  return (
    <>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </>
  );
}
