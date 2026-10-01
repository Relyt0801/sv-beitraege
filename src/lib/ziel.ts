/**
 * Von der Startseite direkt in einen bestimmten Chat springen.
 *
 * Der Chats-Reiter wird erst beim Wechsel aufgebaut – deshalb merkt sich
 * dieses Modul das Ziel, bis der Reiter es abholt. Läuft der Reiter schon,
 * bekommt er zusätzlich ein Ereignis.
 */
export type ChatZiel = { topicId: string } | { team: true };

const EREIGNIS = "sv:chat-ziel";
let wartend: ChatZiel | null = null;

export function chatZielSetzen(z: ChatZiel): void {
  wartend = z;
  window.dispatchEvent(new Event(EREIGNIS));
}

/** Holt das Ziel ab (nur einmal). */
export function chatZielNehmen(): ChatZiel | null {
  const z = wartend;
  wartend = null;
  return z;
}

export function aufChatZiel(f: () => void): () => void {
  window.addEventListener(EREIGNIS, f);
  return () => window.removeEventListener(EREIGNIS, f);
}
