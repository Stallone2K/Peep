import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { db } from "@/lib/db";
import { createPersonalTeam } from "@/lib/team";

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  // NextAuth v5 defaults to reading AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
  // (etc.) from env. Passing explicit clientId/clientSecret keeps the
  // GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET naming our .env has used
  // since day one.
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "database" },
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      // Every new account gets a personal team (owns the Peep Card, 500 credits
      // by default) + an OWNER membership. Record the grant against the team.
      const teamId = await createPersonalTeam({
        id: user.id,
        name: user.name,
        email: user.email,
      });
      await db.creditLedger.create({
        data: {
          userId: user.id,
          teamId,
          delta: 500,
          reason: "signup_grant",
        },
      });
    },
  },
});
