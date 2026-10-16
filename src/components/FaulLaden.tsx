import { Component, lazy, Suspense, type ComponentType, type ErrorInfo, type LazyExoticComponent, type ReactNode } from "react";
import { meldeFehler } from "../lib/melder";

/**
 * Seltene, große Teile der App erst laden, wenn man sie braucht
 * (Update 1.4, U3 – Leistung).
 *
 * Vorher steckte alles in EINER Datei (1,3 MB, 374 KB gezippt): Admin-, Eltern-,
 * Finanz- und Rollen-Code wurde auch für jede Schülerin geladen und beim Start
 * ausgewertet. Auf schwachen Handys waren das fast 1 s Rechenzeit, auf
 * langsamem Netz 9–13 s bis zum ersten Bild.
 *
 * Benutzung (App.tsx):
 *
 *   const FinanzenTab = faul(() => import("./components/FinanzenTab").then((m) => ({ default: m.FinanzenTab })));
 *   <FaulGrenze fallback={<SkelettKarten />}><FinanzenTab … /></FaulGrenze>
 *
 * Exporte und Importe der geladenen Dateien bleiben unverändert – die
 * `.then(m => ({ default: m.X }))` macht den benannten Export zum Standard.
 *
 *   faul()          wie React.lazy, aber mit bis zu zwei Wiederholungen
 *                   (kurzer Aussetzer im Mobilfunk) und Eintrag in die Liste
 *                   zum Vorladen
 *   FaulGrenze      Suspense + Fehlerfang: zeigt den Platzhalter, und wenn die
 *                   Datei auch nach den Wiederholungen nicht kommt (offline,
 *                   alter Stand nach einem Update), eine verständliche Meldung
 *   allesVorladen() holt nach dem Start im Leerlauf alle Teile, damit der
 *                   erste Tipp auf einen Reiter nicht auf das Netz wartet
 */

type Lader = () => Promise<unknown>;
const alle: Lader[] = [];

async function mitWiederholung<T>(laden: () => Promise<T>): Promise<T> {
  let letzter: unknown;
  for (let versuch = 0; versuch < 3; versuch++) {
    try {
      return await laden();
    } catch (e) {
      letzter = e;
      // 0,7 s, dann 1,6 s warten – ein Funkloch dauert selten länger
      await new Promise((r) => setTimeout(r, versuch === 0 ? 700 : 1600));
    }
  }
  throw letzter;
}

export function faul<T extends ComponentType<any>>(laden: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  // Jede Datei wird nur einmal geholt; der Browser merkt sich das Ergebnis ohnehin
  let einmal: Promise<{ default: T }> | null = null;
  const holen = () => {
    if (!einmal) einmal = mitWiederholung(laden).catch((e) => {
      einmal = null; // beim nächsten Versuch (z. B. nach „Neu laden“) frisch holen
      throw e;
    });
    return einmal;
  };
  alle.push(holen);
  return lazy(holen);
}

/**
 * Nach dem Start im Leerlauf nachladen – nicht bei Datensparmodus oder sehr
 * langsamer Verbindung (dort lädt man nur, was man wirklich öffnet).
 * Der Service Worker hat die Dateien ohnehin schon im Zwischenspeicher.
 */
export function allesVorladen(): void {
  const verb = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (verb?.saveData || verb?.effectiveType === "slow-2g" || verb?.effectiveType === "2g") return;
  let i = 0;
  const naechste = () => {
    if (i >= alle.length) return;
    const lader = alle[i++];
    // Fehler hier sind egal – wer den Teil öffnet, bekommt ihn mit Wiederholung neu
    void lader().catch(() => {}).finally(() => idle(naechste));
  };
  idle(naechste);
}

function idle(f: () => void) {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(f, { timeout: 4000 });
  else setTimeout(f, 300);
}

interface Zustand {
  fehler: boolean;
}

class Fehlerfaenger extends Component<{ still: boolean; children: ReactNode }, Zustand> {
  state: Zustand = { fehler: false };
  static getDerivedStateFromError(): Zustand {
    return { fehler: true };
  }
  componentDidCatch(_e: Error, _info: ErrorInfo) {
    // Blätter (still) haben keinen Platz für eine Karte – dann nur eine Meldung
    if (this.props.still) meldeFehler("Das konnte nicht geladen werden. Bitte Verbindung prüfen und die App neu laden.");
  }
  render() {
    if (!this.state.fehler) return this.props.children;
    if (this.props.still) return null;
    return (
      <div className="card mx-auto mt-3 max-w-md p-5 text-center" role="alert">
        <p className="text-[15px] font-semibold">Dieser Teil konnte nicht geladen werden.</p>
        <p className="mt-1 text-[13px] text-tinte-leise">Meist fehlt kurz das Internet oder die App hat sich gerade aktualisiert.</p>
        <button className="btn-primary mt-4" onClick={() => window.location.reload()}>
          Neu laden
        </button>
      </div>
    );
  }
}

/** Suspense mit Platzhalter und freundlichem Fehlerfall. `still`: für Blätter (kein Platz für eine Karte). */
export function FaulGrenze({ children, fallback = null, still = false }: { children: ReactNode; fallback?: ReactNode; still?: boolean }) {
  return (
    <Fehlerfaenger still={still}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </Fehlerfaenger>
  );
}
