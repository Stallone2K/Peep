import "dotenv/config";
import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";

// Idempotent multi-tenancy backfill: give every existing User a personal Team
// (OWNER membership), move planTier + creditBalance onto it, and stamp teamId on
// all of that user's existing rows. Safe to run repeatedly — it only fills nulls
// and skips users who already own a team. Run on the prod DB once during the
// combined rollout AFTER `prisma db push`.

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "team"
  );
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  while (await db.team.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${randomBytes(2).toString("hex")}`;
  }
  return slug;
}

async function main() {
  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, planTier: true, creditBalance: true },
  });

  let created = 0;
  let skipped = 0;

  for (const u of users) {
    const existing = await db.teamMember.findFirst({
      where: { userId: u.id, role: "OWNER" },
      select: { teamId: true },
    });

    let teamId: string;
    if (existing) {
      teamId = existing.teamId;
      skipped++;
    } else {
      const slug = await uniqueSlug(slugify(u.name || u.email?.split("@")[0] || "team"));
      const team = await db.team.create({
        data: {
          name: u.name || "Personal",
          slug,
          planTier: u.planTier,
          creditBalance: u.creditBalance,
          members: { create: { userId: u.id, role: "OWNER" } },
        },
        select: { id: true },
      });
      teamId = team.id;
      await db.user.update({ where: { id: u.id }, data: { defaultTeamId: teamId } });
      created++;
    }

    const scope = { userId: u.id, teamId: null };
    await Promise.all([
      db.apiKey.updateMany({ where: scope, data: { teamId } }),
      db.scrapeJob.updateMany({ where: scope, data: { teamId } }),
      db.crawlJob.updateMany({ where: scope, data: { teamId } }),
      db.batchJob.updateMany({ where: scope, data: { teamId } }),
      db.extractJob.updateMany({ where: scope, data: { teamId } }),
      db.changeSnapshot.updateMany({ where: scope, data: { teamId } }),
      db.creditLedger.updateMany({ where: scope, data: { teamId } }),
      db.idempotencyRecord.updateMany({ where: scope, data: { teamId } }),
    ]);
  }

  console.log(
    `backfill-teams: ${users.length} users · ${created} teams created · ${skipped} already had a team`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("backfill-teams failed:", e);
  process.exit(1);
});
