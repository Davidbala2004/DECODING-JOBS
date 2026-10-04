import type { Metadata } from "next";

import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3333"),
  title: "DECODING JOBS — Command Center",
  description: "High-speed, map-based job search command center for tech students.",
};

// Browser extensions inject their own attributes into the DOM *before* React
// hydrates — LastPass adds `fdprocessedid` to every button, ColorZilla adds
// `cz-shortcut-listen`, Grammarly adds `data-gr-ext-installed` to <body>. React
// then reports a hydration mismatch for markup we never rendered.
// `suppressHydrationWarning` on <body> only covers <body>'s own attributes, not
// the buttons further down, so we strip the known offenders before hydration
// and keep a cheap filtered observer running in case they land a moment later.
// The observer's attributeFilter means it only fires for these exact names,
// never for React's own class/style writes, so it costs nothing on a busy map.
const STRIP_EXTENSION_ATTRS = `
(function () {
  var ATTRS = ["fdprocessedid", "cz-shortcut-listen", "data-gr-ext-installed", "data-new-gr-c-s-check-loaded"];
  var SEL = ATTRS.map(function (a) { return "[" + a + "]"; }).join(",");
  function stripAll(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(SEL)) ATTRS.forEach(function (a) { root.removeAttribute(a); });
    if (root.querySelectorAll) root.querySelectorAll(SEL).forEach(function (el) {
      ATTRS.forEach(function (a) { el.removeAttribute(a); });
    });
  }
  stripAll(document.documentElement);
  // attributeFilter only — deliberately no childList. Observing childList
  // subtree-wide would mint a MutationRecord for every node the map inserts
  // on each zoom; attribute-filtered records are only produced for these four
  // names, which React itself never writes, so the observer stays idle.
  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) muts[i].target.removeAttribute(muts[i].attributeName);
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ATTRS,
    subtree: true,
  });
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: STRIP_EXTENSION_ATTRS }} />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
