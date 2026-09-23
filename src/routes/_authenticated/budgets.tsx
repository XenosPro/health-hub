import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CATEGORIES, CATEGORY_COLORS, budgetStatus, currentMonthKey, formatMoney, spendByCategory,
  useBudgets, useGoals, useInvalidate, useProfile, useTransactions, type Budget, type Goal,
} from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/budgets")({
  head: () => ({ meta: [{ title: "Budgets & goals — Tally" }, { name: "description", content: "Set monthly budgets and track savings goals." }] }),
  component: BudgetsPage,
});

const statusCls = { ok: "text-good", near: "text-warn", over: "text-destructive" };

function BudgetsPage() {
  const { data: profile } = useProfile();
  const { data: budgets = [] } = useBudgets();
  const { data: goals = [] } = useGoals();
  const { data: txs = [] } = useTransactions();
  const invalidate = useInvalidate();
  const cur = profile?.currency ?? "USD";
  const spent = spendByCategory(txs, currentMonthKey());
  const [bDlg, setBDlg] = useState<{ open: boolean; b?: Budget }>({ open: false });
  const [gDlg, setGDlg] = useState<{ open: boolean; g?: Goal }>({ open: false });
  const totalB = budgets.reduce((s, b) => s + b.amount, 0);
  const totalS = budgets.reduce((s, b) => s + (spent[b.category] ?? 0), 0);

  const delBudget = async (b: Budget) => {
    const { error } = await supabase.from("monthly_budgets").delete().eq("id", b.id);
    if (error) return void toast.error(error.message);
    invalidate("budgets");
  };
  const delGoal = async (g: Goal) => {
    if (!confirm(`Delete goal "${g.name}"?`)) return;
    const { error } = await supabase.from("savings_goals").delete().eq("id", g.id);
    if (error) return void toast.error(error.message);
    invalidate("goals");
  };
  const contribute = async (g: Goal) => {
    const v = Number(prompt(`Add how much to "${g.name}"?`, "50"));
    if (!v || v <= 0) return;
    const { error } = await supabase.from("savings_goals").update({ saved_amount: g.saved_amount + v }).eq("id", g.id);
    if (error) return void toast.error(error.message);
    toast.success(`Added ${formatMoney(v, cur)}`);
    invalidate("goals");
  };

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Monthly budgets</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{formatMoney(totalS, cur, true)}</span> of <span className="font-mono">{formatMoney(totalB, cur, true)}</span> used this month
            </p>
          </div>
          <Button onClick={() => setBDlg({ open: true })}><Plus className="size-4" />Add budget</Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {budgets.map((b) => {
            const s = spent[b.category] ?? 0;
            const st = budgetStatus(s, b.amount);
            return (
              <div key={b.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: CATEGORY_COLORS[b.category] }} />
                  <p className="flex-1 font-medium">{b.category}</p>
                  <button aria-label="Edit" onClick={() => setBDlg({ open: true, b })} className="p-1 text-muted-foreground hover:text-foreground"><Pencil className="size-3.5" /></button>
                  <button aria-label="Delete" onClick={() => delBudget(b)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                </div>
                <Progress value={Math.min(100, (s / (b.amount || 1)) * 100)} className="mt-3 h-2" />
                <div className="mt-2 flex justify-between text-xs">
                  <span className="font-mono">{formatMoney(s, cur)} / {formatMoney(b.amount, cur, true)}</span>
                  <span className={`font-medium ${statusCls[st]}`}>
                    {st === "over" ? `Over by ${formatMoney(s - b.amount, cur, true)}` : st === "near" ? "Almost there" : `${formatMoney(b.amount - s, cur, true)} left`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Savings goals</h2>
            <p className="text-sm text-muted-foreground">Put money aside for what matters.</p>
          </div>
          <Button onClick={() => setGDlg({ open: true })}><Plus className="size-4" />Add goal</Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {goals.length === 0 && <p className="text-sm text-muted-foreground">No goals yet.</p>}
          {goals.map((g) => {
            const pct = Math.min(100, (g.saved_amount / g.target_amount) * 100);
            const months = g.deadline ? Math.max(1, Math.round((+new Date(g.deadline) - Date.now()) / 2.63e9)) : null;
            const left = Math.max(0, g.target_amount - g.saved_amount);
            return (
              <div key={g.id} className="rounded-2xl border bg-card p-5">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <p className="font-semibold">{g.name}</p>
                    <p className="text-xs text-muted-foreground">{g.deadline ? `By ${g.deadline}` : "No deadline"}</p>
                  </div>
                  <button aria-label="Edit" onClick={() => setGDlg({ open: true, g })} className="p-1 text-muted-foreground hover:text-foreground"><Pencil className="size-3.5" /></button>
                  <button aria-label="Delete" onClick={() => delGoal(g)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                </div>
                <p className="mt-3 font-mono text-2xl font-semibold">{formatMoney(g.saved_amount, cur, true)} <span className="text-sm font-normal text-muted-foreground">/ {formatMoney(g.target_amount, cur, true)}</span></p>
                <Progress value={pct} className="mt-3 h-2" />
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{pct >= 100 ? "Goal reached 🎉" : months ? `Save ${formatMoney(left / months, cur, true)}/mo to hit it` : `${Math.round(pct)}% there`}</span>
                  <Button size="sm" variant="outline" onClick={() => contribute(g)}>Add money</Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <BudgetDialog key={`b${bDlg.b?.id}${bDlg.open}`} {...bDlg} used={budgets.map((b) => b.category)} onClose={() => setBDlg({ open: false })} />
      <GoalDialog key={`g${gDlg.g?.id}${gDlg.open}`} {...gDlg} onClose={() => setGDlg({ open: false })} />
    </div>
  );
}

function BudgetDialog({ open, b, used, onClose }: { open: boolean; b?: Budget; used: string[]; onClose: () => void }) {
  const invalidate = useInvalidate();
  const free = CATEGORIES.filter((c) => !used.includes(c) || c === b?.category);
  const [category, setCategory] = useState(b?.category ?? free[0] ?? "Other");
  const [amount, setAmount] = useState(b ? String(b.amount) : "");
  const save = async () => {
    const v = Number(amount);
    if (!(v >= 0) || !amount) return void toast.error("Enter a valid amount");
    const { data: u } = await supabase.auth.getUser();
    const { error } = b
      ? await supabase.from("monthly_budgets").update({ amount: v, category }).eq("id", b.id)
      : await supabase.from("monthly_budgets").insert({ user_id: u.user!.id, category, amount: v });
    if (error) return void toast.error(error.message.includes("unique") ? "That category already has a budget" : error.message);
    toast.success("Budget saved");
    invalidate("budgets");
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{b ? "Edit budget" : "New budget"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{free.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bamt">Monthly limit</Label>
            <Input id="bamt" type="number" min="0" step="10" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GoalDialog({ open, g, onClose }: { open: boolean; g?: Goal; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [name, setName] = useState(g?.name ?? "");
  const [target, setTarget] = useState(g ? String(g.target_amount) : "");
  const [saved, setSaved] = useState(g ? String(g.saved_amount) : "0");
  const [deadline, setDeadline] = useState(g?.deadline ?? "");
  const save = async () => {
    const t = Number(target), s = Number(saved);
    if (!name.trim() || name.length > 80) return void toast.error("Give the goal a name");
    if (!(t > 0)) return void toast.error("Target must be greater than 0");
    if (!(s >= 0)) return void toast.error("Saved amount can't be negative");
    const row = { name: name.trim(), target_amount: t, saved_amount: s, deadline: deadline || null };
    const { data: u } = await supabase.auth.getUser();
    const { error } = g
      ? await supabase.from("savings_goals").update(row).eq("id", g.id)
      : await supabase.from("savings_goals").insert({ ...row, user_id: u.user!.id });
    if (error) return void toast.error(error.message);
    toast.success("Goal saved");
    invalidate("goals");
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{g ? "Edit goal" : "New savings goal"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="gn">Name</Label><Input id="gn" value={name} onChange={(e) => setName(e.target.value)} placeholder="New laptop" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="gt">Target</Label><Input id="gt" type="number" min="0" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="gs">Saved so far</Label><Input id="gs" type="number" min="0" value={saved} onChange={(e) => setSaved(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="gd">Deadline (optional)</Label><Input id="gd" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
