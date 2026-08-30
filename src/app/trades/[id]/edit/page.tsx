import type { InputHTMLAttributes } from "react";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrCreateDefaultAccount, getTransaction } from "@/lib/trades";
import { updateTrade } from "@/app/portfolio-actions";

export const dynamic = "force-dynamic";

export default async function EditTrade({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const session = await getSession();
  if (!session) redirect("/login");

  const account = await getOrCreateDefaultAccount(session.sub);
  const t = await getTransaction(account.id, id);
  if (!t) notFound();

  const action = updateTrade.bind(null, id);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-950 px-6 py-16 font-sans text-zinc-100">
      <div className="w-full max-w-md">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Edit trade</h1>
        <p className="mb-6 text-sm text-zinc-500">
          {t.symbol} · {t.tradedAt.toISOString().slice(0, 10)}
        </p>

        <form action={action} className="flex flex-col gap-4">
          {error && (
            <p className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          <Field label="Ticker" name="symbol" defaultValue={t.symbol} required />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Side</span>
            <select
              name="side"
              defaultValue={t.side}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500"
            >
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </label>
          <Field
            label="Quantity"
            name="quantity"
            type="number"
            step="any"
            defaultValue={t.quantity.toString()}
            required
          />
          <Field
            label="Price / share"
            name="price"
            type="number"
            step="any"
            defaultValue={t.price.toString()}
            required
          />
          <Field
            label="Fees"
            name="fees"
            type="number"
            step="any"
            defaultValue={t.fees.toString()}
          />
          <Field
            label="Date"
            name="tradedAt"
            type="date"
            defaultValue={t.tradedAt.toISOString().slice(0, 10)}
          />
          <Field label="Note (optional)" name="note" defaultValue={t.note ?? ""} />
          <div className="mt-2 flex gap-3">
            <button className="rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400">
              Save changes
            </button>
            <Link
              href="/"
              className="rounded-md border border-zinc-700 px-5 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              Cancel
            </Link>
          </div>
        </form>
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
