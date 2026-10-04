export type EventType = "info" | "umfrage" | "nachricht";

export interface PollOption {
  id: string;
  label: string;
}

export interface EventItem {
  id: string;
  type: EventType;
  title: string;
  body: string;
  is_warning: boolean;
  audience: "all" | "selected" | "komitee";
  poll_multiple: boolean;
  poll_min_one: boolean;
  poll_show_results: boolean;
  /** anonym = nur das Stufenteam sieht, wer wie gestimmt hat */
  poll_anon: boolean;
  created_by: string | null;
  created_at: string;
  options: PollOption[];
  target_ids: string[];
  /** Komitee-Slugs, wenn audience = "komitee" */
  tags: string[];
}

export interface NewEvent {
  type: EventType;
  title: string;
  body: string;
  is_warning: boolean;
  audience: "all" | "selected" | "komitee";
  target_ids: string[];
  tags: string[];
  poll_multiple: boolean;
  poll_min_one: boolean;
  poll_show_results: boolean;
  poll_anon: boolean;
  options: string[]; // Antwort-Labels
}

/**
 * "nachricht" gibt es nur noch für alte Beiträge – neu angelegt wird nur
 * Info (mit allen Optionen, die früher die Nachricht hatte) und Abstimmung.
 */
export const TYPE_META: Record<EventType, { label: string; icon: string }> = {
  info: { label: "Info", icon: "📌" },
  umfrage: { label: "Abstimmung", icon: "🗳️" },
  nachricht: { label: "Info", icon: "📌" },
};

/** Was man im Formular neu anlegen kann */
export const NEUE_TYPEN: EventType[] = ["info", "umfrage"];
