import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const CATEGORIES = [
  "Housing",
  "Food",
  "Transport",
  "Shopping",
  "Entertainment",
  "Utilities",
  "Health",
  "Other",
] as const;
export const INCOME_CATEGORIES = ["Salary", "Freelance", "Refund", "Other income"] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  Housing: "var(--chart-1)",
  Food: "var(--chart-2)",
  Transport: "var(--chart-3)",
  Shopping: "var(--chart-4)",
  Entertainment: "var(--chart-6)",
  Utilities: "var(--chart-7)",
  Health: "var(--chart-5)",
  Other: "var(--chart-8)",
};

export interface Transaction {
  id: string;
  user_id: string;
  type: "expense" | "income";
  amount: number;
  category: string;
  merchant: string;
  note: string | null;
  occurred_on: string;
  source: "manual" | "csv" | "receipt";
  receipt_path: string | null;
  created_at: string;
}
export interface Budget {
  id: string;
  category: string;
  amount: number;
}
export interface Goal {
  id: string;
  name: string;
  target_amount: number;
  saved_amount: number;
  deadline: string | null;
}
export interface Profile {
  id: string;
  display_name: string;
  currency: string;
  monthly_income: number;
  username: string | null;
  role: "user" | "admin";
}
export interface Account {
  id: string;
  name: string;
  kind: string;
  institution: string;
  balance: number;
}

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("id,name,kind,institution,balance").order("created_at");
      if (error) throw error;
      return (data ?? []).map((a) => ({ ...a, balance: Number(a.balance) })) as Account[];
    },
  });
}

export function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      return !!data;
    },
  });
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (error) throw error;
      return data ? ({ ...data, monthly_income: Number(data.monthly_income) } as Profile) : null;
    },
  });
}

export function useTransactions() {
  return useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []).map((t) => ({ ...t, amount: Number(t.amount) })) as Transaction[];
    },
  });
}

export function useBudgets() {
  return useQuery({
    queryKey: ["budgets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("monthly_budgets").select("id,category,amount").order("category");
      if (error) throw error;
      return (data ?? []).map((b) => ({ ...b, amount: Number(b.amount) })) as Budget[];
    },
  });
}

export function useGoals() {
  return useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("savings_goals").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []).map((g) => ({
        ...g,
        target_amount: Number(g.target_amount),
        saved_amount: Number(g.saved_amount),
      })) as Goal[];
    },
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export function formatMoney(v: number, currency = "USD", compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 0 : 2,
    minimumFractionDigits: compact ? 0 : 2,
  }).format(v);
}

export const monthKey = (iso: string) => iso.slice(0, 7);
export const currentMonthKey = () => new Date().toISOString().slice(0, 7);
export const prevMonthKey = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 2, 1));
  return d.toISOString().slice(0, 7);
};
export const monthLabel = (key: string, style: "short" | "long" = "short") => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en-US", {
    month: style,
    year: style === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  });
};

export function spendByCategory(txs: Transaction[], month: string) {
  const out: Record<string, number> = {};
  for (const t of txs) {
    if (t.type !== "expense" || monthKey(t.occurred_on) !== month) continue;
    out[t.category] = (out[t.category] ?? 0) + t.amount;
  }
  return out;
}

export function monthTotals(txs: Transaction[], month: string) {
  let spent = 0;
  let income = 0;
  for (const t of txs) {
    if (monthKey(t.occurred_on) !== month) continue;
    if (t.type === "expense") spent += t.amount;
    else income += t.amount;
  }
  return { spent, income };
}

export interface Insight {
  tone: "good" | "warn" | "bad" | "info";
  text: string;
}

export function buildInsights(txs: Transaction[], budgets: Budget[], currency: string): Insight[] {
  const cur = currentMonthKey();
  const prev = prevMonthKey(cur);
  const a = spendByCategory(txs, cur);
  const b = spendByCategory(txs, prev);
  const out: Insight[] = [];
  const day = new Date().getUTCDate();
  const daysInMonth = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0).getDate();

  for (const cat of Object.keys({ ...a, ...b })) {
    const now = a[cat] ?? 0;
    const before = b[cat] ?? 0;
    if (before > 20 && now > 0) {
      const pct = Math.round(((now - before) / before) * 100);
      if (pct >= 15) out.push({ tone: "warn", text: `You spent ${pct}% more on ${cat.toLowerCase()} this month than last month.` });
      else if (pct <= -15) out.push({ tone: "good", text: `Nice — ${cat} spending is down ${Math.abs(pct)}% vs last month.` });
    }
  }
  const totNow = Object.values(a).reduce((s, v) => s + v, 0);
  const totPrev = Object.values(b).reduce((s, v) => s + v, 0);
  const totalBudget = budgets.reduce((s, x) => s + x.amount, 0);
  if (totalBudget > 0 && day > 3) {
    const projected = (totNow / day) * daysInMonth;
    if (projected > totalBudget)
      out.push({ tone: "bad", text: `At this pace you'll spend about ${formatMoney(projected, currency, true)} this month — ${formatMoney(projected - totalBudget, currency, true)} over your total budget.` });
    else out.push({ tone: "good", text: `On track: projected spend ${formatMoney(projected, currency, true)} of ${formatMoney(totalBudget, currency, true)} budgeted.` });
  }
  const top = Object.entries(a).filter(([c]) => c !== "Housing").sort((x, y) => y[1] - x[1])[0];
  if (top) out.push({ tone: "info", text: `${top[0]} is your biggest flexible expense this month at ${formatMoney(top[1], currency, true)}.` });
  if (totPrev > 0 && totNow < totPrev * 0.9 && day > 20)
    out.push({ tone: "good", text: `Overall spending is ${Math.round((1 - totNow / totPrev) * 100)}% lower than last month.` });
  return out.slice(0, 5);
}

export function budgetStatus(spent: number, limit: number): "ok" | "near" | "over" {
  if (limit <= 0) return "ok";
  if (spent > limit) return "over";
  if (spent >= limit * 0.8) return "near";
  return "ok";
}
