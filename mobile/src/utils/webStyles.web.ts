// Web build: global CSS the React Native styles can't express — the scrollbars, painted in the app's own palette
// (see theme.ts): a black track, a lavender-wash thumb, the Solana purple on hover. Also loads Inter, the
// landing page's typeface (theme.ts WEB_FONT), and gives it to the text fields too.
import { PF_COLORS as C, WEB_FONT } from "../theme";

if (typeof document !== "undefined" && !document.getElementById("draftgem-web-styles")) {
  const font = document.createElement("link");
  font.rel = "stylesheet";
  font.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
  document.head.appendChild(font);

  const style = document.createElement("style");
  style.id = "draftgem-web-styles";
  style.textContent = `
    * { scrollbar-width: thin; scrollbar-color: ${C.glassStrong} transparent; }
    *::-webkit-scrollbar { width: 10px; height: 10px; }
    *::-webkit-scrollbar-track { background: transparent; }
    *::-webkit-scrollbar-corner { background: transparent; }
    *::-webkit-scrollbar-thumb {
      background-color: ${C.glassStrong};
      border-radius: 999px;
      border: 2px solid ${C.bg};
    }
    *::-webkit-scrollbar-thumb:hover { background-color: ${C.accent}; }
    *::-webkit-scrollbar-thumb:active { background-color: ${C.accentHover}; }
    html, body { background-color: ${C.bg}; font-family: ${WEB_FONT}; }
    input, textarea { font-family: ${WEB_FONT}; }
  `;
  document.head.appendChild(style);
}
