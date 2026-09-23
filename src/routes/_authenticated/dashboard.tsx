import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { AlertTriangle, Lightbulb, Plus, TrendingDown, TrendingUp, PiggyBank, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransactionDialog } from "@/components/TransactionDialog";
import {
  CATEGORY_COLORS, budgetStatus, buildInsights, currentMonthKey, formatMoney, monthLabel, monthTotals,
  prevMonthKey, spendByCategory, useBudgets, useGoals, useProfile, useTransactions,
} from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Overview — Tally" }, { name: "description", content: "Your monthly spending at a glance." }] }),
  component: Dashboard,
});

const toneCls = { good: "border-success/30 bg-success/10", warn: "border-warning/40 bg-warning/10", bad: "border-destructive/30 bg-destructive/10", info: "border-border bg-muted/50" };

function Dashboard() {
  const { data: profile } = useProfile();
  const { data: txs = [], isLoading } = useTransactions();
  const { data: budgets = [] } = useBudgets();
  const { data: goals = [] } = useGoals();
  const [open, setOpen] = useState(false);
  const cur = profile?.currency ?? "USD";
  const month = currentMonthKey();

  const { spent, income } = monthTotals(txs, month);
  const earned = income || profile?.monthly_income || 0;
  const saved = goals.reduce((s, g) => s + g.saved_amount, 0);
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const remaining = earned - spent;
  const byCat = spendByCategory(txs, month);
  const donut = Object.entries(byCat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const insights = useMemo(() => buildInsights(txs, budgets, cur), [txs, budgets, cur]);
  const warnings = budgets
    .map((b) => ({ ...b, spent: byCat[b.category] ?? 0, status: budgetStatus(byCat[b.category] ?? 0, b.amount) }))
    .filter((b) => b.status !== "ok");

  const trend = useMemo(() => {
    const keys: string[] = [];
    let k = month;
    for (let i = 0; i < 6; i++) { keys.unshift(k); k = prevMonthKey(k); }
    return keys.map((key) => ({ month: monthLabel(key), spent: Math.round(monthTotals(txs, key).spent) }));
  }, [txs, month]);

  const stats = [
    { label: "Spent this month", value: spent, icon: TrendingDown, hint: totalBudget ? `${Math.round((spent / totalBudget) * 100)}% of ${formatMoney(totalBudget, cur, true)} budget` : "" },
    { label: "Income", value: earned, icon: TrendingUp, hint: monthLabel(month, "long") },
    { label: "Remaining", value: remaining, icon: Wallet, hint: remaining >= 0 ? "Left to spend or save" : "Over your income", neg: remaining < 0 },
    { label: "Saved toward goals", value: saved, icon: PiggyBank, hint: `${goals.length} active goal${goals.length === 1 ? "" : "s"}` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{monthLabel(month, "long")}</p>
          <h1 className="text-2xl font-semibold sm:text-3xl">Hi {profile?.display_name?.split(" ")[0] || "there"} 👋</h1>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Add transaction</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">{s.label}<s.icon className="size-4" /></div>
            <p className={`mt-2 font-mono text-xl font-semibold sm:text-2xl ${s.neg ? "text-destructive" : ""}`}>{isLoading ? "—" : formatMoney(s.value, cur, true)}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{s.hint}</p>
          </div>
        ))}
      </div>

      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w) => (
            <div key={w.id} className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${w.status === "over" ? toneCls.bad : toneCls.warn}`}>
              <AlertTriangle className={`size-4 shrink-0 ${w.status === "over" ? "text-destructive" : "text-warning"}`} />
              <span>
                <strong>{w.category}</strong>{" "}
                {w.status === "over"
                  ? `is over budget by ${formatMoney(w.spent - w.amount, cur)}.`
                  : `is at ${Math.round((w.spent / w.amount) * 100)}% of its ${formatMoney(w.amount, cur, true)} budget.`}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-2xl border bg-card p-5 lg:col-span-2">
          <h2 className="font-semibold">Spending by category</h2>
          {donut.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">No expenses yet this month.</p> : (
            <>
              <div className="h-52">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={donut} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
                      {donut.map((d) => <Cell key={d.name} fill={CATEGORY_COLORS[d.name] ?? "var(--chart-8)"} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatMoney(v, cur)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {donut.map((d) => (
                  <li key={d.name} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: CATEGORY_COLORS[d.name] }} />
                    <span className="flex-1 truncate">{d.name}</span>
                    <span className="font-mono">{formatMoney(d.value, cur, true)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="rounded-2xl border bg-card p-5 lg:col-span-3">
          <h2 className="font-semibold">Spending over time</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <AreaChart data={trend} margin={{ left: -10, right: 8 }}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `${Math.round(v / 100) / 10}k`} />
                <Tooltip formatter={(v: number) => formatMoney(v, cur)} />
                <Area type="monotone" dataKey="spent" stroke="var(--primary)" strokeWidth={2} fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-2xl border bg-card p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold"><Lightbulb className="size-4 text-primary" /> Insights</h2>
          <ul className="mt-3 space-y-2">
            {insights.length === 0 && <li className="text-sm text-muted-foreground">Add a few transactions to unlock insights.</li>}
            {insights.map((i, n) => <li key={n} className={`rounded-lg border p-3 text-sm ${toneCls[i.tone]}`}>{i.text}</li>)}
          </ul>
        </section>
        <section className="rounded-2xl border bg-card p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent transactions</h2>
            <Link to="/transactions" className="text-sm font-medium text-primary">View all</Link>
          </div>
          <ul className="mt-3 divide-y">
            {txs.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[t.category] ?? "var(--success)" }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.merchant}</p>
                  <p className="text-xs text-muted-foreground">{t.category} · {t.occurred_on}</p>
                </div>
                <span className={`font-mono text-sm ${t.type === "income" ? "text-success" : ""}`}>{t.type === "income" ? "+" : "−"}{formatMoney(t.amount, cur)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <TransactionDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
