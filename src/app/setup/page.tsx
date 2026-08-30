import type { ReactNode, InputHTMLAttributes } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { totpQrDataUrl } from "@/lib/totp";
import { setupCredentials, enableTotp } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const count = await prisma.user.count();

  // ── Phase A: no user yet → create username + password ──
  if (count === 0) {
    return (
      <Shell
        title="Create your account"
        subtitle="One-time setup. This is the only account for StockWallet."
      >
        <form action={setupCredentials} className="flex flex-col gap-4">
          {error && <ErrorNote>{error}</ErrorNote>}
          <Field label="Username" name="username" autoComplete="username" required />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
          <Submit>Continue</Submit>
        </form>
      </Shell>
    );
  }

  // ── User exists → gate Phase B behind the fresh setup session ──
  const session = await getSession();
  const user = session
    ? await prisma.user.findUnique({ where: { id: session.sub } })
    : null;

  if (!user) redirect("/login");
  if (user.totpEnabled) redirect("/login");

  const qr = user.totpSecret
    ? await totpQrDataUrl(user.username, user.totpSecret)
    : null;

  // ── Phase B: scan QR, confirm a code to enable 2FA ──
  return (
    <Shell
      title="Set up your authenticator"
      subtitle="Scan this with Google Authenticator, Authy, or 1Password, then enter the 6-digit code to finish."
    >
      <div className="flex flex-col items-center gap-6">
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qr}
            alt="Authenticator QR code"
            className="h-48 w-48 rounded-lg bg-white p-2"
          />
        )}
        {user.totpSecret && (
          <p className="text-center text-xs text-zinc-500">
            Can&apos;t scan? Enter this key manually:
            <br />
            <span className="font-mono text-zinc-400 break-all">
              {user.totpSecret}
            </span>
          </p>
        )}
        <form action={enableTotp} className="flex w-full flex-col gap-4">
          {error && <ErrorNote>{error}</ErrorNote>}
          <Field
            label="6-digit code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            required
          />
          <Submit>Finish setup</Submit>
        </form>
      </div>
    </Shell>
  );
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-950 px-6 py-24 font-sans text-zinc-100">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-3xl font-bold tracking-tight">
          Stock<span className="text-emerald-400">Wallet</span>
        </h1>
        <h2 className="mt-4 text-lg font-semibold">{title}</h2>
        <p className="mb-8 text-sm text-zinc-500">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-400">{label}</span>
      <input
        {...props}
        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500"
      />
    </label>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
      {children}
    </p>
  );
}

function Submit({ children }: { children: React.ReactNode }) {
  return (
    <button className="mt-2 rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400">
      {children}
    </button>
  );
}
