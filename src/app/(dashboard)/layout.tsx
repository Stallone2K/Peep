import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { TopBar } from "@/components/dashboard/top-bar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Suspense fallback={<SidebarSkeleton />}>
        <SidebarWithSession />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar teamName="Personal" />
        <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

async function SidebarWithSession() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  return (
    <SidebarNav
      userEmail={session.user.email}
      userName={session.user.name}
      userImage={session.user.image}
    />
  );
}

function SidebarSkeleton() {
  return (
    <aside className="border-border/60 bg-background flex h-screen w-60 shrink-0 flex-col border-r">
      <div className="border-border/60 h-14 border-b" />
    </aside>
  );
}
