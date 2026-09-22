export type RiskBand = "high" | "medium" | "low";
export type Segment = "Enterprise" | "Mid-market" | "SMB";

export interface Account {
  id: string;
  name: string;
  domain: string;
  initials: string;
  churnScore: number;
  trend: number[];
  owner: string;
  arr: number;
  renewalDate: string; // ISO
  segment: Segment;
  signals: string;
}

export const riskBandOf = (score: number): RiskBand =>
  score >= 70 ? "high" : score >= 45 ? "medium" : "low";

export const statusLabel: Record<RiskBand, string> = {
  high: "At risk",
  medium: "Watch",
  low: "Healthy",
};

export const accounts: Account[] = [
  {
    id: "northwind",
    name: "Northwind Logistics",
    domain: "northwind.io",
    initials: "NV",
    churnScore: 87,
    trend: [40, 55, 50, 70, 80, 100],
    owner: "Dana Reyes",
    arr: 480000,
    renewalDate: "2026-10-12",
    segment: "Enterprise",
    signals: "Usage down 34% over 30 days; 2 support escalations; last renewal call 41 days ago.",
  },
  {
    id: "halcyon",
    name: "Halcyon Retail",
    domain: "halcyon.shop",
    initials: "HL",
    churnScore: 64,
    trend: [60, 55, 65, 50, 60, 70],
    owner: "Marcus Vell",
    arr: 265000,
    renewalDate: "2026-10-28",
    segment: "Mid-market",
    signals: "Champion left in August; adoption flat across two new teams.",
  },
  {
    id: "orbital",
    name: "Orbital Health",
    domain: "orbitalhealth.com",
    initials: "OR",
    churnScore: 22,
    trend: [70, 60, 50, 40, 35, 30],
    owner: "Priya Anand",
    arr: 720000,
    renewalDate: "2027-01-04",
    segment: "Enterprise",
    signals: "Expansion conversation open for 120 extra seats.",
  },
  {
    id: "bluefin",
    name: "Bluefin Analytics",
    domain: "bluefin.co",
    initials: "BF",
    churnScore: 58,
    trend: [50, 60, 55, 65, 60, 70],
    owner: "Tomas Kiro",
    arr: 190000,
    renewalDate: "2026-11-02",
    segment: "Mid-market",
    signals: "Support backlog cleared, but weekly active users still trailing target.",
  },
  {
    id: "sable",
    name: "Sable & Co",
    domain: "sable.co",
    initials: "SA",
    churnScore: 31,
    trend: [65, 55, 45, 40, 35, 30],
    owner: "Lena Ford",
    arr: 340000,
    renewalDate: "2026-12-19",
    segment: "SMB",
    signals: "Steady usage; exec sponsor engaged in quarterly review.",
  },
  {
    id: "carraway",
    name: "Carraway Foods",
    domain: "carraway.com",
    initials: "CF",
    churnScore: 74,
    trend: [45, 50, 62, 68, 72, 88],
    owner: "Dana Reyes",
    arr: 128000,
    renewalDate: "2026-10-06",
    segment: "SMB",
    signals: "Invoice dispute unresolved; logins down 52% month over month.",
  },
  {
    id: "meridian",
    name: "Meridian Labs",
    domain: "meridianlabs.ai",
    initials: "ML",
    churnScore: 49,
    trend: [55, 58, 52, 60, 54, 58],
    owner: "Priya Anand",
    arr: 540000,
    renewalDate: "2026-12-09",
    segment: "Enterprise",
    signals: "New security review pending before renewal paperwork.",
  },
  {
    id: "vantage",
    name: "Vantage Retail Group",
    domain: "vantage.group",
    initials: "VR",
    churnScore: 18,
    trend: [60, 52, 44, 38, 30, 24],
    owner: "Lena Ford",
    arr: 98000,
    renewalDate: "2027-03-30",
    segment: "Mid-market",
    signals: "Power-user growth up 21%; strong NPS response last cycle.",
  },
];
