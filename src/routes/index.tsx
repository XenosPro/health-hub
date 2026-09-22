import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Wallet, PieChart, ScanLine, Bell } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tally — Personal Budget & Expense Tracker" },
      { name: "description", content: "Set budgets, track expenses, scan receipts and get personal spending insights with Tally." },
      { property: "og:title", content: "Tally — Personal Budget & Expense Tracker" },
      { property: "og:description", content: "Set budgets, track expenses, scan receipts and get personal spending insights with Tally." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: PieChart, title: "See the whole picture", text: "Spent, saved and remaining at a glance, with charts by category and month." },
  { icon: ScanLine, title: "Snap a receipt", text: "Upload a photo and Tally fills in the merchant, amount, date and category." },
  { icon: Bell, title: "Warnings before it's too late", text: "Get alerted at 80% of a budget and when you go over." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-display text-lg font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="size-4" />
          </span>
          Tally
        </div>
        <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-20 pt-12">
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] sm:text-6xl">
          Spend with intent. <span className="text-primary">Save without thinking.</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Tally is a simple personal budget tracker: set monthly limits, log or import expenses, and get clear insights about your habits.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg"><Link to="/auth">Get started free</Link></Button>
        </div>
        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card p-6">
              <f.icon className="size-5 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
