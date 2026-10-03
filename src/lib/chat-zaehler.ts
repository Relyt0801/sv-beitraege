import { useTopics, type Topic } from "../topics-store";
import { komiteeAn, useMitteilungen } from "./mitteilungen";

/**
 * Zählt ein Chat für mich beim roten Punkt mit?
 *  - alte Planungs-Ordner (ohne Ansicht): nie
 *  - Gespräche mit dem Stufenteam: nur solange sie offen sind
 *  - Komitee-Chats: eigene ja, fremde nur, wenn man sie eingeschaltet hat
 *  - Stufenteam-Chat: ja
 */
export function useZaehltMit(): (t: Topic) => boolean {
  const { tagMembers, uid } = useTopics();
  const { mitteilungen } = useMitteilungen();
  return (t: Topic) => {
    if (t.kind === "ordner") return false;
    if (t.kind === "ticket") return t.status !== "erledigt";
    if (!t.tag) return true;
    return komiteeAn(mitteilungen, t.tag, (tagMembers[t.tag] || []).includes(uid));
  };
}

/** Summe der ungelesenen Einträge in allen Chats, die für mich zählen. */
export function useChatZaehler(): number {
  const { topics, unreadCount } = useTopics();
  const zaehlt = useZaehltMit();
  return topics.reduce((s, t) => s + (zaehlt(t) ? unreadCount(t.id) : 0), 0);
}
