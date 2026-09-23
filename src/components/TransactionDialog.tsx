import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, INCOME_CATEGORIES, useInvalidate, type Transaction } from "@/lib/finance";

export interface TxDraft {
  type: "expense" | "income";
  amount: string;
  category: string;
  merchant: string;
  note: string;
  occurred_on: string;
  source?: Transaction["source"];
  receipt_path?: string | null;
}

const schema = z.object({
  type: z.enum(["expense", "income"]),
  amount: z.coerce.number().positive("Amount must be greater than 0").max(10_000_000),
  category: z.string().min(1).max(40),
  merchant: z.string().trim().min(1, "Add a merchant or description").max(120),
  note: z.string().trim().max(300),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
});

export const emptyDraft = (): TxDraft => ({
  type: "expense",
  amount: "",
  category: "Food",
  merchant: "",
  note: "",
  occurred_on: new Date().toISOString().slice(0, 10),
});

export function TransactionDialog({
  open,
  onOpenChange,
  editing,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing?: Transaction | null | undefined;
  initial?: TxDraft | null | undefined;
}) {
  const invalidate = useInvalidate();
  const [d, setD] = useState<TxDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing)
      setD({
        type: editing.type,
        amount: String(editing.amount),
        category: editing.category,
        merchant: editing.merchant,
        note: editing.note ?? "",
        occurred_on: editing.occurred_on,
      });
    else setD(initial ?? emptyDraft());
  }, [open, editing, initial]);

  const cats = d.type === "expense" ? CATEGORIES : INCOME_CATEGORIES;

  const save = async () => {
    const p = schema.safeParse(d);
    if (!p.success) return void toast.error(p.error.issues[0]?.message);
    setBusy(true);
    const payload = { ...p.data, note: p.data.note || null };
    const { data: u } = await supabase.auth.getUser();
    const res = editing
      ? await supabase.from("transactions").update(payload).eq("id", editing.id)
      : await supabase.from("transactions").insert({
          ...payload,
          user_id: u.user!.id,
          source: d.source ?? "manual",
          receipt_path: d.receipt_path ?? null,
        });
    setBusy(false);
    if (res.error) return void toast.error(res.error.message);
    toast.success(editing ? "Transaction updated" : "Transaction added");
    await invalidate("transactions");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit transaction" : "New transaction"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setD((x) => ({ ...x, type: t, category: t === "expense" ? "Food" : "Salary" }))}
              className={`rounded-md py-1.5 text-sm font-medium capitalize ${d.type === t ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input inputMode="decimal" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={d.occurred_on} onChange={(e) => setD({ ...d, occurred_on: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{d.type === "expense" ? "Merchant" : "Source"}</Label>
            <Input value={d.merchant} onChange={(e) => setD({ ...d, merchant: e.target.value })} placeholder="e.g. Trader Joe's" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={d.category} onValueChange={(v) => setD({ ...d, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
