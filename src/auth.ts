import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

// Single-user app: only this GitHub account may sign in. Real financial data
// lives here, so everyone else is turned away at the door.
const ALLOWED_GITHUB_LOGIN = "xKAMALEONx";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [GitHub],
  session: { strategy: "database" },
  callbacks: {
    async signIn({ profile }) {
      const login = (profile as { login?: string } | undefined)?.login;
      return login === ALLOWED_GITHUB_LOGIN;
    },
  },
});
