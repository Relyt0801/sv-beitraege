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
  audience: "all" | "selected";
  poll_multiple: boolean;
  poll_min_one: boolean;
  poll_show_results: boolean;
  created_by: string | null;
  created_at: string;
  options: PollOption[];
  target_ids: string[];
}

export interface NewEvent {
  type: EventType;
  title: string;
  body: string;
  is_warning: boolean;
  audience: "all" | "selected";
  target_ids: string[];
  poll_multiple: boolean;
  poll_min_one: boolean;
  poll_show_results: boolean;
  options: string[]; // Antwort-Labels
}

export const TYPE_META: Record<EventType, { label: string; icon: string }> = {
  info: { label: "Infobeitrag", icon: "📌" },
  umfrage: { label: "Abstimmung", icon: "🗳️" },
  nachricht: { label: "Nachricht", icon: "✉️" },
};
