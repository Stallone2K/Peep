import type { DefaultSession } from "next-auth";
import type { PlanTier } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      planTier?: PlanTier;
    } & DefaultSession["user"];
  }
}
