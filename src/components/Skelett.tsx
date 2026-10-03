/**
 * Platzhalter beim Laden – graue Blöcke in der Form des Inhalts statt
 * Kreisel mit „wird geladen …“. Wirkt ruhiger und springt beim Fertigwerden
 * nicht um. Die Blöcke pulsieren leicht (bei „Bewegung reduzieren“ nicht).
 */
const BLOCK = "rounded-lg bg-[rgb(118_118_128/0.14)] motion-safe:animate-pulse dark:bg-[rgb(118_118_128/0.26)]";

/** Eine Zeile wie in einer Liste: Kreis, zwei Textzeilen, rechts ein Wert. */
function Zeile({ i }: { i: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className={`h-10 w-10 shrink-0 !rounded-full ${BLOCK}`} />
      <div className="min-w-0 flex-1">
        <div className={`h-3.5 ${BLOCK}`} style={{ width: `${55 + ((i * 17) % 30)}%` }} />
        <div className={`mt-2 h-3 ${BLOCK}`} style={{ width: `${30 + ((i * 11) % 25)}%` }} />
      </div>
      <div className={`h-4 w-12 shrink-0 ${BLOCK}`} />
    </div>
  );
}

/** Liste mit n Zeilen (ohne eigenen Kartenrahmen, für <main className="card">). */
export function SkelettZeilen({ n = 6 }: { n?: number }) {
  return (
    <div aria-busy="true" aria-label="Wird geladen" className="divide-y divide-papier-linie dark:divide-slate-800">
      {Array.from({ length: n }, (_, i) => (
        <Zeile key={i} i={i} />
      ))}
    </div>
  );
}

/** Karten-Stapel: Überschrift-Block und darunter n Karten. */
export function SkelettKarten({ n = 3, gross = false }: { n?: number; gross?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Wird geladen" className="grid gap-3">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card p-4">
          <div className="flex items-center gap-3">
            <div className={`h-9 w-9 shrink-0 ${BLOCK}`} />
            <div className="min-w-0 flex-1">
              <div className={`h-4 ${BLOCK}`} style={{ width: `${45 + ((i * 19) % 35)}%` }} />
              <div className={`mt-2 h-3 ${BLOCK}`} style={{ width: `${25 + ((i * 13) % 30)}%` }} />
            </div>
          </div>
          {gross && <div className={`mt-4 h-24 ${BLOCK}`} />}
        </div>
      ))}
    </div>
  );
}

/** Ein paar Textzeilen, z. B. in einer Karte. */
export function SkelettText({ zeilen = 2 }: { zeilen?: number }) {
  return (
    <div aria-busy="true" aria-label="Wird geladen" className="grid gap-2 py-1">
      {Array.from({ length: zeilen }, (_, i) => (
        <div key={i} className={`h-3.5 ${BLOCK}`} style={{ width: `${85 - i * 20}%` }} />
      ))}
    </div>
  );
}
