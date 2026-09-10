import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Fängt Render-Fehler ab. Ohne das zeigt React eine komplett weiße Seite
 * und man muss raten, was los war.
 */
export class Fehlerfang extends Component<
  { children: ReactNode },
  { fehler: Error | null; stelle: string }
> {
  state = { fehler: null as Error | null, stelle: "" };

  static getDerivedStateFromError(fehler: Error) {
    return { fehler };
  }

  componentDidCatch(fehler: Error, info: ErrorInfo) {
    console.error("[Stufenkasse] Anzeigefehler:", fehler, info.componentStack);
    // Erste verwertbare Zeile aus Stack bzw. Komponentenbaum merken
    const ausStack = (fehler.stack || "").split("\n").slice(1, 3).join("\n");
    const ausBaum = (info.componentStack || "").trim().split("\n").slice(0, 3).join("\n");
    this.setState({ stelle: [ausStack, ausBaum].filter(Boolean).join("\n") });
  }

  render() {
    const f = this.state.fehler;
    if (!f) return this.props.children;
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="card w-full max-w-sm p-6 text-center">
          <div className="text-3xl">😵</div>
          <div className="mt-2 text-lg font-bold">Da ist etwas schiefgegangen</div>
          <p className="mt-1 text-sm text-slate-500">
            Die Seite konnte nicht angezeigt werden. Ein Neustart hilft fast immer.
          </p>
          <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-slate-100 p-2 text-left text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800">
            {f.message}
            {this.state.stelle ? "\n" + this.state.stelle : ""}
          </pre>
          <p className="mt-2 text-[11px] text-slate-400">
            Bitte diesen Kasten abfotografieren – daraus lässt sich die Ursache ablesen.
          </p>
          <button className="btn-primary mt-4" onClick={() => window.location.reload()}>
            Neu laden
          </button>
          <button
            className="mt-2 w-full text-sm font-semibold text-slate-400"
            onClick={() => this.setState({ fehler: null })}
          >
            Trotzdem weiter
          </button>
        </div>
      </div>
    );
  }
}
