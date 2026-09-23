import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Camera, FileUp, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TransactionDialog, type TxDraft } from "@/components/TransactionDialog";
import { extractReceipt } from "@/lib/receipts.functions";
import { CATEGORIES, CATEGORY_COLORS, INCOME_CATEGORIES, formatMoney, useInvalidate, useProfile, useTransactions, type Transaction } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({ meta: [{ title: "Transactions — Tally" }, { name: "description", content: "Search, import and manage your transactions." }] }),
  component: TransactionsPage,
});

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

function toIsoDate(v: string) {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) { const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`; }
  const d = new Date(s);
  return isNaN(+d) ? null : d.toISOString().slice(0, 10);
}

const KEYWORDS: [RegExp, string][] = [
  [/rent|mortgage|apartment/i, "Housing"], [/grocer|food|market|restaurant|cafe|coffee|pizza|chipotle|whole foods|trader|safeway|costco/i, "Food"],
  [/uber|lyft|gas|shell|chevron|transit|parking/i, "Transport"], [/amazon|target|walmart|store|shop/i, "Shopping"],
  [/netflix|spotify|cinema|theatre|steam/i, "Entertainment"], [/electric|water|internet|comcast|pg&e|phone|verizon/i, "Utilities"],
  [/pharmacy|cvs|doctor|gym|health|dental/i, "Health"],
];
const guessCategory = (m: string) => KEYWORDS.find(([r]) => r.test(m))?.[1] ?? "Other";

function TransactionsPage() {
  const { data: profile } = useProfile();
  const { data: txs = [], isLoading } = useTransactions();
  const invalidate = useInvalidate();
  const extract = useServerFn(extractReceipt);
  const cur = profile?.currency ?? "USD";
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [type, setType] = useState("all");
  const [month, setMonth] = useState("all");
  const [dialog, setDialog] = useState<{ open: boolean; editing?: Transaction | null; initial?: TxDraft | null }>({ open: false });
  const [busy, setBusy] = useState<string | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const rcptRef = useRef<HTMLInputElement>(null);

  const months = useMemo(() => [...new Set(txs.map((t) => t.occurred_on.slice(0, 7)))], [txs]);
  const filtered = txs.filter((t) =>
    (cat === "all" || t.category === cat) && (type === "all" || t.type === type) &&
    (month === "all" || t.occurred_on.startsWith(month)) &&
    (!q || `${t.merchant} ${t.note ?? ""} ${t.category}`.toLowerCase().includes(q.toLowerCase())),
  );
  const total = filtered.reduce((s, t) => s + (t.type === "expense" ? -t.amount : t.amount), 0);

  const remove = async (t: Transaction) => {
    if (!confirm(`Delete "${t.merchant}"?`)) return;
    const { error } = await supabase.from("transactions").delete().eq("id", t.id);
    if (error) return void toast.error(error.message);
    if (t.receipt_path) await supabase.storage.from("receipts").remove([t.receipt_path]);
    toast.success("Transaction deleted");
    invalidate("transactions");
  };

  const importCsv = async (file: File) => {
    setBusy("csv");
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error("The file has no rows");
      const head = rows[0]!.map((h) => h.toLowerCase().trim());
      const idx = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
      const iDate = idx("date"), iDesc = idx("description", "merchant", "payee", "name", "memo"), iAmt = idx("amount");
      const iDebit = idx("debit", "withdrawal"), iCredit = idx("credit", "deposit"), iCat = idx("category");
      if (iDate < 0 || (iAmt < 0 && iDebit < 0)) throw new Error("Need at least Date and Amount columns");
      const { data: u } = await supabase.auth.getUser();
      const num = (s?: string) => Number((s ?? "").replace(/[^0-9.-]/g, "")) || 0;
      const items = rows.slice(1).flatMap((r) => {
        const date = toIsoDate(r[iDate] ?? "");
        let amt = iAmt >= 0 ? num(r[iAmt]) : num(r[iCredit]) - num(r[iDebit]);
        if (!date || !amt) return [];
        const merchant = (r[iDesc] ?? "Imported").trim().slice(0, 120) || "Imported";
        const kind = amt > 0 ? "income" : "expense";
        amt = Math.abs(amt);
        const csvCat = iCat >= 0 ? (r[iCat] ?? "").trim() : "";
        const known = [...CATEGORIES, ...INCOME_CATEGORIES] as readonly string[];
        const category = known.includes(csvCat) ? csvCat : kind === "income" ? "Other income" : guessCategory(merchant);
        return [{ user_id: u.user!.id, type: kind, amount: amt, merchant, category, occurred_on: date, source: "csv" }];
      });
      if (!items.length) throw new Error("No valid transactions found");
      const { error } = await supabase.from("transactions").insert(items.slice(0, 1000));
      if (error) throw error;
      toast.success(`Imported ${items.length} transactions`);
      invalidate("transactions");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
      if (csvRef.current) csvRef.current.value = "";
    }
  };

  const scanReceipt = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) return void toast.error("Receipt must be under 10MB");
    setBusy("receipt");
    try {
      const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
      const { data: u } = await supabase.auth.getUser();
      const path = `${u.user!.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
      const [up, info] = await Promise.all([supabase.storage.from("receipts").upload(path, file), extract({ data: { dataUrl } })]);
      setDialog({
        open: true,
        initial: { type: "expense", amount: String(info.amount || ""), category: info.category, merchant: info.merchant, note: info.note, occurred_on: info.date, source: "receipt", receipt_path: up.error ? null : path },
      });
      toast.success("Receipt read — check the details and save");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read the receipt");
    } finally {
      setBusy(null);
      if (rcptRef.current) rcptRef.current.value = "";
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Transactions</h1>
          <p className="text-sm text-muted-foreground">Your full spending and income history.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
          <input ref={rcptRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => e.target.files?.[0] && scanReceipt(e.target.files[0])} />
          <Button variant="outline" disabled={!!busy} onClick={() => csvRef.current?.click()}><FileUp className="size-4" />{busy === "csv" ? "Importing…" : "Import CSV"}</Button>
          <Button variant="outline" disabled={!!busy} onClick={() => rcptRef.current?.click()}><Camera className="size-4" />{busy === "receipt" ? "Reading…" : "Scan receipt"}</Button>
          <Button onClick={() => setDialog({ open: true })}><Plus className="size-4" />Add</Button>
        </div>
      </div>

      <div className="grid gap-2 rounded-2xl border bg-card p-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchant or note" className="pl-9" />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="sm:w-32"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All types</SelectItem><SelectItem value="expense">Expenses</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent>
        </Select>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {[...CATEGORIES, ...INCOME_CATEGORIES].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All months</SelectItem>{months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} transactions · net <span className="font-mono">{formatMoney(total, cur)}</span> · CSV needs Date, Description and Amount (or Debit/Credit) columns.
      </p>

      <div className="overflow-hidden rounded-2xl border bg-card">
        {isLoading ? <p className="p-10 text-center text-sm text-muted-foreground">Loading…</p> : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No transactions match.</p>
        ) : (
          <ul className="divide-y">
            {filtered.map((t) => (
              <li key={t.id} className="group flex items-center gap-3 px-4 py-3">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[t.category] ?? "var(--good)" }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.merchant}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.occurred_on} · {t.category}{t.source !== "manual" && ` · ${t.source}`}{t.note && ` · ${t.note}`}
                  </p>
                </div>
                <span className={`font-mono text-sm ${t.type === "income" ? "text-good" : ""}`}>{t.type === "income" ? "+" : "−"}{formatMoney(t.amount, cur)}</span>
                <button aria-label="Edit" onClick={() => setDialog({ open: true, editing: t })} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-4" /></button>
                <button aria-label="Delete" onClick={() => remove(t)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <TransactionDialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} editing={dialog.editing} initial={dialog.initial} />
    </div>
  );
}
