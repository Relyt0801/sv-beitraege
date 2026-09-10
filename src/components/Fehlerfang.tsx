import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Fängt Render-Fehler ab. Ohne das zeigt React eine komplett weiße Seite
 * und man muss raten, was los war.
 */
export class Fehlerfang extends Component<{ children: ReactNode }, { fehler: Error | null }> {
  state = { fehler: null as Error | null };

  static getDerivedStateFromError(fehler: Error) {
    return { fehler };
  }

  componentDidCatch(fehler: Error, info: ErrorInfo) {
    console.error("[Stufenkasse] Anzeigefehler:", fehler, info.componentStack);
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
          <pre className="mt-3 max-h-32 overflow-auto rounded-xl bg-slate-100 p-2 text-left text-[11px] text-slate-500 dark:bg-slate-800">
            {f.message}
          </pre>
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
