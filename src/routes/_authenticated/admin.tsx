import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, useIsAdmin } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Tally" }, { name: "description", content: "Admin overview of all users." }] }),
  component: AdminPage,
});

function AdminPage() {
  const { data: isAdmin, isLoading } = useIsAdmin();
  const { data: rows = [] } = useQuery({
    queryKey: ["admin-overview"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_overview");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!isAdmin)
    return (
      <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-semibold">Admins only</h1>
        <p className="mt-1 text-sm text-muted-foreground">You don't have access to this page.</p>
        <Link to="/dashboard" className="mt-4 inline-block text-sm font-medium text-primary">Back to overview</Link>
      </div>
    );

  const totalTx = rows.reduce((s, r) => s + Number(r.tx_count), 0);
  const totalSpent = rows.reduce((s, r) => s + Number(r.total_spent), 0);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold sm:text-3xl">Admin dashboard</h1>
      <div className="grid grid-cols-3 gap-3">
        {[["Users", rows.length], ["Transactions", totalTx], ["Total tracked spend", formatMoney(totalSpent, "USD", true)]].map(([l, v]) => (
          <div key={l} className="rounded-2xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="mt-1 font-mono text-xl font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr><th className="p-3">Name</th><th className="p-3">Username</th><th className="p-3">Role</th><th className="p-3">Joined</th><th className="p-3 text-right">Transactions</th><th className="p-3 text-right">Spent</th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-3 font-medium">{r.display_name}</td>
                <td className="p-3 text-muted-foreground">{r.username ? `@${r.username}` : "—"}</td>
                <td className="p-3 capitalize">{r.role}</td>
                <td className="p-3 text-muted-foreground">{r.created_at.slice(0, 10)}</td>
                <td className="p-3 text-right font-mono">{r.tx_count}</td>
                <td className="p-3 text-right font-mono">{formatMoney(Number(r.total_spent), r.currency, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
