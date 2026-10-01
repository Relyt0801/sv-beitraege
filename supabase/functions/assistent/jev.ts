// Jev (TypeSafe „System One“) – schnelle, begrenzte Entscheidungen statt Text.
// Nach https://github.com/grandamenium/jev-anything (scaffolding/jev_client.ts).
//
// Zwei Wege, je nachdem welcher Schlüssel als Supabase-Secret gesetzt ist:
//   TYPESAFE_API_KEY   → direkt bei TypeSafe (ein Dienstleister weniger)
//   OPENROUTER_API_KEY → über OpenRouter (dieser Weg ist laut jev-anything am
//                        22.09.2026 live geprüft)
// Der direkte Weg ist hier NICHT gegen die echte Schnittstelle getestet
// (die Doku war aus dieser Umgebung nicht erreichbar) – Felder wie beim
// OpenRouter-Weg. Antwortet er mit 4xx, OPENROUTER_API_KEY nehmen.
//
// Wichtig (aus dem Skill): Jev garantiert das FORMAT der Antwort, nicht dass
// sie stimmt. Deshalb entscheidet nie Jev allein – siehe regeln.ts.

export type Frage =
  | { type: "noul"; instructions: string; criteria?: Record<string, string> }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

interface JevAntwort {
  model?: string;
  answers: Record<string, Record<string, unknown>>;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
}

const WEGE = {
  typesafe: { url: "https://api.typesafe.ai/v1/systemone", model: "jev-latest", env: "TYPESAFE_API_KEY" },
  openrouter: { url: "https://openrouter.ai/api/alpha/decisions", model: "typesafe/jev-1.13", env: "OPENROUTER_API_KEY" },
} as const;

/** Welcher Weg ist eingerichtet? null = keiner (dann gibt es keine Automatik). */
export function jevWeg(): keyof typeof WEGE | null {
  if (Deno.env.get(WEGE.typesafe.env)) return "typesafe";
  if (Deno.env.get(WEGE.openrouter.env)) return "openrouter";
  return null;
}

/** Eine Anfrage, mehrere Fragen über denselben Stand (teilen sich die Eingabe-Tokens). */
export async function jevFragen(state: string, questions: Record<string, Frage>): Promise<JevAntwort> {
  const weg = jevWeg();
  if (!weg) throw new Error("Kein Jev-Schlüssel gesetzt (TYPESAFE_API_KEY oder OPENROUTER_API_KEY).");
  for (const [id, q] of Object.entries(questions)) {
    if (q.type === "choice" && (Object.keys(q.criteria).length < 1 || Object.keys(q.criteria).length > 255)) {
      throw new Error(`Jev-Frage ${id}: choice braucht 1–255 Möglichkeiten`);
    }
    if (q.type === "score" && (q.criteria.length < 2 || q.criteria.length > 10)) {
      throw new Error(`Jev-Frage ${id}: score braucht 2–10 Stufen`);
    }
  }
  const { url, model, env } = WEGE[weg];
  const ctrl = new AbortController();
  const zeit = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${Deno.env.get(env)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, state, questions }),
    });
    if (!r.ok) throw new Error(`Jev antwortet mit HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const daten = (await r.json()) as JevAntwort;
    if (!daten || typeof daten.answers !== "object") throw new Error("Jev-Antwort ohne answers");
    console.log("Jev:", weg, daten.model, "Tokens:", daten.usage?.input_tokens, "Kosten:", daten.usage?.cost);
    return daten;
  } finally {
    clearTimeout(zeit);
  }
}

/** choice → { wahl, sicherheit } oder null, wenn die Antwort fehlt/kaputt ist. */
export function leseWahl(a: JevAntwort, id: string): { wahl: string; sicherheit: number } | null {
  const x = a.answers?.[id];
  if (!x || typeof x.choice !== "string") return null;
  const sicherheit = typeof x.confidence === "number" ? x.confidence : 0;
  return { wahl: x.choice, sicherheit };
}

/** score → Stufe (auch Bruchteil) und Sicherheit. */
export function leseScore(a: JevAntwort, id: string): { score: number; sicherheit: number } | null {
  const x = a.answers?.[id];
  if (!x || typeof x.score !== "number") return null;
  return { score: x.score, sicherheit: typeof x.confidence === "number" ? x.confidence : 0 };
}
