import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CATS = ["Housing", "Food", "Transport", "Shopping", "Entertainment", "Utilities", "Health", "Other"];

export const extractReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        dataUrl: z
          .string()
          .max(14_000_000)
          .regex(/^data:(image\/(png|jpe?g|webp|gif)|application\/pdf);base64,/),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured");
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You extract expense details from receipt images. Today is ${today}. Category must be one of: ${CATS.join(", ")}.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the merchant, total amount paid, date and best category." },
              { type: "image_url", image_url: { url: data.dataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_receipt",
              parameters: {
                type: "object",
                properties: {
                  merchant: { type: "string" },
                  amount: { type: "number", description: "Grand total paid" },
                  date: { type: "string", description: "YYYY-MM-DD" },
                  category: { type: "string", enum: CATS },
                  note: { type: "string", description: "Short summary of items" },
                },
                required: ["merchant", "amount", "date", "category"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "save_receipt" } },
      }),
    });
    if (res.status === 429) throw new Error("Too many scans right now — try again in a minute.");
    if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
    if (!res.ok) throw new Error(`Couldn't read the receipt (${res.status})`);
    const json = (await res.json()) as {
      choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("Couldn't find receipt details in that image.");
    const parsed = JSON.parse(args) as { merchant?: string; amount?: number; date?: string; category?: string; note?: string };
    return {
      merchant: String(parsed.merchant ?? "").slice(0, 120),
      amount: Math.max(0, Number(parsed.amount) || 0),
      date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date ?? "") ? parsed.date! : today,
      category: CATS.includes(parsed.category ?? "") ? parsed.category! : "Other",
      note: String(parsed.note ?? "").slice(0, 300),
    };
  });
