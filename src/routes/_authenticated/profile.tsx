import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney, useAccounts, useCurrentUser, useInvalidate, useProfile } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Tally" }, { name: "description", content: "Manage your profile and accounts." }] }),
  component: ProfilePage,
});

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "DZD", "MAD", "CHF", "INR"];
const schema = z.object({
  display_name: z.string().trim().min(1, "Name is required").max(80),
  username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,24}$/, "Username: 3–24 letters, numbers or _"),
  currency: z.string().length(3),
  monthly_income: z.coerce.number().min(0).max(10_000_000),
});

function ProfilePage() {
  const { data: profile } = useProfile();
  const { data: user } = useCurrentUser();
  const { data: accounts = [] } = useAccounts();
  const invalidate = useInvalidate();
  const [f, setF] = useState({ display_name: "", username: "", currency: "USD", monthly_income: "" });
  const [acc, setAcc] = useState({ name: "", kind: "checking", institution: "", balance: "" });

  useEffect(() => {
    if (profile) setF({ display_name: profile.display_name, username: profile.username ?? "", currency: profile.currency, monthly_income: String(profile.monthly_income) });
  }, [profile]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = schema.safeParse(f);
    if (!p.success) return toast.error(p.error.issues[0]?.message);
    const { error } = await supabase.from("profiles").update(p.data).eq("id", profile!.id);
    if (error) return toast.error(error.message.includes("username") ? "That username is taken" : error.message);
    toast.success("Profile updated");
    invalidate("profile");
  };

  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acc.name.trim()) return toast.error("Name the account");
    const { error } = await supabase.from("accounts").insert({
      user_id: profile!.id, name: acc.name.trim().slice(0, 60), kind: acc.kind, institution: acc.institution.trim().slice(0, 60), balance: Number(acc.balance) || 0,
    });
    if (error) return toast.error(error.message);
    setAcc({ name: "", kind: "checking", institution: "", balance: "" });
    invalidate("accounts");
  };
  const delAccount = async (id: string) => {
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    invalidate("accounts");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border bg-card p-6">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground">{user?.email} · <span className="capitalize">{profile?.role}</span></p>
        <form onSubmit={save} className="mt-6 space-y-4">
          <div className="space-y-1.5"><Label htmlFor="n">Full name</Label><Input id="n" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="u">Username</Label><Input id="u" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="alex_m" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="i">Monthly income</Label><Input id="i" type="number" min="0" value={f.monthly_income} onChange={(e) => setF({ ...f, monthly_income: e.target.value })} /></div>
          </div>
          <Button type="submit">Save changes</Button>
        </form>
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Accounts</h2>
        <p className="text-sm text-muted-foreground">Bank accounts, cards and cash you track.</p>
        <ul className="mt-4 divide-y">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a.name}</p>
                <p className="text-xs capitalize text-muted-foreground">{a.kind}{a.institution && ` · ${a.institution}`}</p>
              </div>
              <span className="font-mono text-sm">{formatMoney(a.balance, profile?.currency)}</span>
              <button aria-label="Delete account" onClick={() => delAccount(a.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
        <form onSubmit={addAccount} className="mt-4 grid grid-cols-2 gap-2">
          <Input placeholder="Account name" value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} />
          <Input placeholder="Bank" value={acc.institution} onChange={(e) => setAcc({ ...acc, institution: e.target.value })} />
          <Select value={acc.kind} onValueChange={(v) => setAcc({ ...acc, kind: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["checking", "savings", "credit", "cash"].map((k) => <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Balance" type="number" value={acc.balance} onChange={(e) => setAcc({ ...acc, balance: e.target.value })} />
          <Button type="submit" variant="outline" className="col-span-2"><Plus className="size-4" />Add account</Button>
        </form>
      </section>
    </div>
  );
}
