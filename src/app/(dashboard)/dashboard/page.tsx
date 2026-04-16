import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/db";

export const metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}

async function DashboardContent() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true, creditBalance: true, planTier: true },
  });

  return (
    <>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Signed In As {user?.email ?? session.user.email}
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <Button type="submit" variant="outline">
            Sign Out
          </Button>
        </form>
      </header>

      <section className="border-border bg-card grid gap-4 rounded-lg border p-6">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-sm">Plan</span>
          <span className="font-medium">{user?.planTier ?? "FREE"}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-sm">Credits</span>
          <span className="font-mono text-lg">
            {user?.creditBalance?.toLocaleString() ?? 0}
          </span>
        </div>
      </section>

      <p className="text-muted-foreground text-sm">
        Phase 1 Is Live. API Keys, Scraping, And The Playground Arrive In Phase
        2 And Phase 3.
      </p>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <header className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-20" />
      </header>
      <Skeleton className="h-32 w-full rounded-lg" />
    </>
  );
}
