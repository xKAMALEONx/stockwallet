import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { login } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const needsSetup = (await prisma.user.count()) === 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-950 px-6 py-24 font-sans text-zinc-100">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-3xl font-bold tracking-tight">
          Stock<span className="text-emerald-400">Wallet</span>
        </h1>
        <p className="mb-8 text-sm text-zinc-500">Sign in to your account.</p>

        {needsSetup ? (
          <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-4 py-3 text-sm text-zinc-300">
            No account yet.{" "}
            <Link href="/setup" className="font-medium text-emerald-400 underline">
              Set one up →
            </Link>
          </div>
        ) : (
          <form action={login} className="flex flex-col gap-4">
            {error && (
              <p className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-400">Username</span>
              <input
                name="username"
                autoComplete="username"
                required
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-400">Password</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-400">Authenticator code</span>
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 tracking-widest text-zinc-100 outline-none focus:border-emerald-500"
              />
            </label>
            <button className="mt-2 rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400">
              Sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
