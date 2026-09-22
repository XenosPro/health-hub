import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  accounts,
  riskBandOf,
  statusLabel,
  type Account,
  type RiskBand,
  type Segment,
} from "@/data/accounts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pulse — Customer Health Command" },
      {
        name: "description",
        content:
          "Track churn risk scores, renewal dates and usage signals across every customer account in one live command center.",
      },
      { property: "og:title", content: "Pulse — Customer Health Command" },
      {
        property: "og:description",
        content:
          "Track churn risk scores, renewal dates and usage signals across every customer account in one live command center.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const TODAY = new Date("2026-09-22T00:00:00Z");

const riskFilters = ["all", "high", "medium", "low"] as const;
const segmentFilters = ["all", "Enterprise", "Mid-market", "SMB"] as const;
const renewalFilters = ["any", "30d", "90d"] as const;

type SortKey = "churnScore" | "renewalDate" | "arr" | "name";

const toneClass: Record<RiskBand, { text: string; bg: string; ring: string; bar: string }> = {
  high: { text: "text-bad", bg: "bg-bad/15", ring: "ring-bad/25", bar: "bg-bad" },
  medium: { text: "text-warn", bg: "bg-warn/15", ring: "ring-warn/25", bar: "bg-warn" },
  low: { text: "text-good", bg: "bg-good/15", ring: "ring-good/25", bar: "bg-good" },
};

const daysUntil = (iso: string) =>
  Math.round((new Date(iso).getTime() - TODAY.getTime()) / 86_400_000);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });

const formatArr = (v: number) => `$${Math.round(v / 1000)}K`;

function Sparkline({ values, band }: { values: number[]; band: RiskBand }) {
  const tone = toneClass[band];
  return (
    <div className="flex h-6 items-end gap-[3px]">
      {values.map((v, i) => (
        <span
          key={i}
          className={`w-1 rounded-sm ${tone.bar}`}
          style={{ height: `${v}%`, opacity: 0.4 + (i / (values.length - 1)) * 0.6 }}
        />
      ))}
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  labelFor,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelFor?: (v: T) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-dimmer">{label}</span>
      <div className="flex rounded-full bg-black/30 p-1 ring-1 ring-white/10">
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className={
                active
                  ? "rounded-full bg-accent2/20 px-3 py-1 text-xs font-semibold text-accent2 ring-1 ring-accent2/30"
                  : "rounded-full px-3 py-1 text-xs font-medium text-dim transition-colors hover:text-foreground"
              }
            >
              {labelFor ? labelFor(opt) : opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Dashboard() {
  const [risk, setRisk] = useState<(typeof riskFilters)[number]>("all");
  const [segment, setSegment] = useState<(typeof segmentFilters)[number]>("all");
  const [renewal, setRenewal] = useState<(typeof renewalFilters)[number]>("any");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "churnScore",
    dir: "desc",
  });
  const [selectedId, setSelectedId] = useState<string>(accounts[0]?.id ?? "");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = accounts.filter((a) => {
      if (risk !== "all" && riskBandOf(a.churnScore) !== risk) return false;
      if (segment !== "all" && a.segment !== (segment as Segment)) return false;
      if (renewal !== "any") {
        const window = renewal === "30d" ? 30 : 90;
        const d = daysUntil(a.renewalDate);
        if (d < 0 || d > window) return false;
      }
      if (q && ![a.name, a.owner, a.domain].some((f) => f.toLowerCase().includes(q))) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const { key } = sort;
      if (key === "name") return a.name.localeCompare(b.name) * dir;
      if (key === "renewalDate")
        return (new Date(a.renewalDate).getTime() - new Date(b.renewalDate).getTime()) * dir;
      return ((a[key] as number) - (b[key] as number)) * dir;
    });
  }, [risk, segment, renewal, query, sort]);

  const selected: Account | undefined =
    rows.find((a) => a.id === selectedId) ?? rows[0] ?? undefined;

  const atRisk = accounts.filter((a) => riskBandOf(a.churnScore) === "high");
  const renewals30 = accounts.filter((a) => {
    const d = daysUntil(a.renewalDate);
    return d >= 0 && d <= 30;
  });
  const renewalArr = renewals30.reduce((s, a) => s + a.arr, 0);

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  const sortIndicator = (key: SortKey) =>
    sort.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : "";

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink font-display text-foreground selection:bg-accent2/30">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-32 h-[560px] w-[560px] animate-[drift_14s_ease-in-out_infinite] rounded-full bg-accent2/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[420px] w-[420px] rounded-full bg-good/10 blur-[120px]" />
        <div className="absolute -bottom-40 right-1/4 h-[460px] w-[460px] rounded-full bg-[oklch(0.62_0.19_256)]/15 blur-[130px]" />
        <div className="grid-field absolute inset-0" />
      </div>

      <div className="relative mx-auto max-w-[1320px] px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-accent2">
              <span className="size-2 rounded-full bg-accent2" />
              <span className="font-mono text-xs uppercase tracking-[0.25em] text-dim">
                Pulse · Success Ops
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold leading-none tracking-tight text-balance sm:text-4xl">
              Customer Health Command
            </h1>
            <p className="mt-2 max-w-[42ch] text-sm text-pretty text-dim">
              Live churn risk, renewal runway and usage signals across the book of business.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10 backdrop-blur-md">
              <span className="size-2 rounded-full bg-good" />
              <span className="font-mono text-xs text-dim">Synced 2m ago</span>
            </div>
            <button className="rounded-full bg-accent2 px-4 py-2 text-sm font-semibold text-ink ring-1 ring-accent2/40 transition-transform hover:-translate-y-0.5">
              Export report
            </button>
          </div>
        </header>

        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="glass-panel relative overflow-hidden rounded-xl p-5">
            <div className="absolute -right-10 -top-10 size-32 rounded-full bg-bad/20 blur-2xl" />
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-dim">
              Accounts at risk
            </p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-4xl font-semibold leading-none text-bad">{atRisk.length}</span>
              <span className="font-mono text-xs text-bad">▲ 4 wk</span>
            </div>
            <p className="mt-2 text-sm text-dim">Score ≥ 70 across {accounts.length} accounts</p>
          </div>
          <div className="glass-panel relative overflow-hidden rounded-xl p-5">
            <div className="absolute -right-10 -top-10 size-32 rounded-full bg-warn/20 blur-2xl" />
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-dim">
              Renewals · 30 days
            </p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-4xl font-semibold leading-none text-warn">
                {renewals30.length}
              </span>
              <span className="font-mono text-xs text-dim">{formatArr(renewalArr)} ARR</span>
            </div>
            <p className="mt-2 text-sm text-dim">
              {renewals30.filter((a) => daysUntil(a.renewalDate) <= 7).length} in the next 7 days
            </p>
          </div>
          <div className="glass-panel relative overflow-hidden rounded-xl p-5">
            <div className="absolute -right-10 -top-10 size-32 rounded-full bg-good/20 blur-2xl" />
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-dim">Net retention</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-4xl font-semibold leading-none text-good">108%</span>
              <span className="font-mono text-xs text-good">▲ 2.4</span>
            </div>
            <p className="mt-2 text-sm text-dim">Expansion outpacing churn</p>
          </div>
        </section>

        <section className="glass-panel mt-6 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <FilterGroup
              label="Risk"
              options={riskFilters}
              value={risk}
              onChange={setRisk}
              labelFor={(v) => (v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1))}
            />
            <FilterGroup
              label="Segment"
              options={segmentFilters}
              value={segment}
              onChange={setSegment}
              labelFor={(v) => (v === "all" ? "All" : v)}
            />
            <FilterGroup
              label="Renewal"
              options={renewalFilters}
              value={renewal}
              onChange={setRenewal}
              labelFor={(v) => (v === "any" ? "Any" : v)}
            />
            <div className="ml-auto flex min-w-[220px] flex-1 items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 ring-1 ring-white/10 sm:max-w-xs">
              <span className="font-mono text-xs text-dimmer">/</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-dimmer focus:outline-none"
                placeholder="Search account, owner, domain"
              />
            </div>
          </div>
        </section>

        <section className="glass-panel mt-5 overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <p className="text-sm font-medium text-dim">
              Accounts{" "}
              <span className="font-mono text-xs text-dimmer">
                · {rows.length} shown · {atRisk.length} flagged
              </span>
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-dimmer">
              Sort · {sort.key === "churnScore" ? "Churn score" : sort.key}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="font-mono text-[11px] uppercase tracking-[0.12em] text-dimmer">
                  <th className="px-5 py-3 font-medium">
                    <button onClick={() => toggleSort("name")} className="hover:text-accent2">
                      Account{sortIndicator("name")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button onClick={() => toggleSort("churnScore")} className="hover:text-accent2">
                      Churn score{sortIndicator("churnScore")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">Trend</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">
                    <button onClick={() => toggleSort("arr")} className="hover:text-accent2">
                      ARR{sortIndicator("arr")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      onClick={() => toggleSort("renewalDate")}
                      className="hover:text-accent2"
                    >
                      Renewal{sortIndicator("renewalDate")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((a) => {
                  const band = riskBandOf(a.churnScore);
                  const tone = toneClass[band];
                  const isSelected = selected?.id === a.id;
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className={
                        isSelected
                          ? "cursor-pointer bg-accent2/[0.06] ring-1 ring-inset ring-accent2/30 transition-colors"
                          : "cursor-pointer transition-colors hover:bg-white/[0.04]"
                      }
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`grid size-9 shrink-0 place-items-center rounded-md font-mono text-xs font-semibold ${tone.bg} ${tone.text}`}
                          >
                            {a.initials}
                          </div>
                          <div>
                            <p className="font-medium">{a.name}</p>
                            <p className="font-mono text-[11px] text-dimmer">{a.domain}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-base font-semibold ${tone.text}`}>
                            {a.churnScore}
                          </span>
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                            <div
                              className={`h-full rounded-full ${tone.bar}`}
                              style={{ width: `${a.churnScore}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Sparkline values={a.trend} band={band} />
                      </td>
                      <td className="px-4 py-4 text-dim">{a.owner}</td>
                      <td className="px-4 py-4 font-mono">{formatArr(a.arr)}</td>
                      <td className="px-4 py-4 font-mono text-dim">{formatDate(a.renewalDate)}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}
                        >
                          <span className={`size-1.5 rounded-full ${tone.bar}`} />
                          {statusLabel[band]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-dim">
                      No accounts match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {selected && (
          <section className="glass-panel mt-4 flex flex-col gap-4 rounded-xl p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent2/15 font-mono text-sm font-semibold text-accent2">
                {selected.initials}
              </div>
              <div>
                <p className="font-medium">
                  {selected.name}{" "}
                  <span className="font-mono text-xs text-dimmer">· {selected.domain}</span>
                </p>
                <p className="mt-1 text-sm text-pretty text-dim">{selected.signals}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="rounded-full bg-white/5 px-4 py-2 text-sm font-medium ring-1 ring-white/15 transition-transform hover:-translate-y-0.5">
                View timeline
              </button>
              <button className="rounded-full bg-accent2 px-4 py-2 text-sm font-semibold text-ink ring-1 ring-accent2/40 transition-transform hover:-translate-y-0.5">
                Open play
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
