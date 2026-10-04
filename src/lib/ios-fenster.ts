/**
 * iOS-Fehler (vor allem iOS 26, App vom Home-Bildschirm): Nach dem ersten
 * Öffnen der Tastatur bleibt das Fenster kleiner, als es ist
 * (window.innerHeight wächst nicht zurück). Alles mit position: fixed und
 * bottom: 0 – unsere Tab-Leiste – steht dann mitten im Bildschirm, darunter
 * ein Streifen.
 *
 * Abhilfe: Wenn ein Eingabefeld verlassen wird (und beim Zurückkommen in die
 * App), prüfen, ob das Fenster geschrumpft ist, und Safari mit einem kurzen
 * display:none/'' am #root zum Neu-Messen bringen. Die Scrollposition bleibt.
 * Quelle: WebKit-Fehler 301857 und die dort verlinkten Berichte.
 */
export function iosFensterReparieren(): void {
  if (typeof window === "undefined") return;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios) return;

  let groesste = window.innerHeight;
  const merken = () => {
    // Querformat/Drehen: neu anfangen
    if (Math.abs(window.innerWidth - breite) > 40) {
      breite = window.innerWidth;
      groesste = window.innerHeight;
    }
    groesste = Math.max(groesste, window.innerHeight);
  };
  let breite = window.innerWidth;
  window.addEventListener("resize", merken);

  const tippt = () => {
    const el = document.activeElement as HTMLElement | null;
    return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
  };

  const heilen = () => {
    if (tippt()) return;
    if (groesste - window.innerHeight <= 4) return;
    const wurzel = document.getElementById("root");
    if (!wurzel) return;
    const y = window.scrollY;
    wurzel.style.display = "none";
    void wurzel.offsetHeight; // Neu-Messen erzwingen
    wurzel.style.display = "";
    window.scrollTo(window.scrollX, y);
  };

  const spaeter = () => {
    setTimeout(heilen, 140);
    setTimeout(heilen, 600);
  };
  window.addEventListener("focusout", spaeter);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") spaeter();
  });
  window.visualViewport?.addEventListener("resize", () => {
    if (!tippt()) spaeter();
  });
}
