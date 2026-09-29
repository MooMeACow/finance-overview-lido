/**
 * Web page setup, run once at startup: the global stylesheet (states React Native Web can't
 * express, like :hover behind a capability query, :focus-visible and :active), the viewport
 * and theme-color tags, and the favicon.
 */
const CSS = `
:root {
  color-scheme: light dark;
  --lido-accent: #1F4FE0;
  --lido-bg: #FBF3E4;
  --lido-scroll: rgba(14, 27, 61, 0.22);
}
@media (prefers-color-scheme: dark) {
  :root {
    --lido-accent: #5B85FF;
    --lido-bg: #07122E;
    --lido-scroll: rgba(210, 222, 255, 0.24);
  }
}
html, body { background: var(--lido-bg); }
html {
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%;
  overscroll-behavior: none;
}
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
::selection { background: color-mix(in srgb, var(--lido-accent) 26%, transparent); }
* { scrollbar-width: thin; scrollbar-color: var(--lido-scroll) transparent; }
*:focus { outline: none; }
*:focus-visible { outline: 2px solid var(--lido-accent); outline-offset: 3px; }
input:focus-visible, textarea:focus-visible { outline: none; }
input:focus, textarea:focus {
  border-color: var(--lido-accent) !important;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--lido-accent) 20%, transparent);
}
input, textarea, select { font-size: 16px; }
input::placeholder, textarea::placeholder { opacity: 1; }
[role="button"], [role="tab"], [role="link"], [role="checkbox"], [role="switch"], a, button { touch-action: manipulation; }
[data-press], [role="tab"] { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
[data-press]:active { scale: 0.96; }
[data-press="soft"]:active { scale: 0.985; }
@media (hover: hover) and (pointer: fine) {
  [data-lift]:hover { translate: 0 -2px; }
}
@media (prefers-reduced-motion: reduce) {
  [data-press]:active, [data-press="soft"]:active { scale: 1; }
  [data-lift]:hover { translate: none; }
}
`;

function meta(name: string, content: string, media?: string) {
  const sel = media ? `meta[name="${name}"][media="${media}"]` : `meta[name="${name}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(sel);
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    if (media) el.media = media;
    document.head.appendChild(el);
  }
  el.content = content;
}

// A cobalt pool tile with a wave and a low sun, as the tab icon
const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#1F4FE0"/><circle cx="44" cy="20" r="7" fill="#FFC56A"/><path d="M8 40c6-6 10-6 16 0s10 6 16 0 10-6 16 0" fill="none" stroke="#D2F6FF" stroke-width="5" stroke-linecap="round"/></svg>`,
  );

if (typeof document !== 'undefined' && !document.getElementById('lido-global')) {
  const style = document.createElement('style');
  style.id = 'lido-global';
  style.textContent = CSS;
  document.head.appendChild(style);

  meta('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content');
  meta('theme-color', '#FBF3E4', '(prefers-color-scheme: light)');
  meta('theme-color', '#07122E', '(prefers-color-scheme: dark)');
  meta('color-scheme', 'light dark');
  meta('description', 'A private money tracker: your accounts, months and plans in one place.');

  let icon = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement('link');
    icon.rel = 'icon';
    document.head.appendChild(icon);
  }
  icon.type = 'image/svg+xml';
  icon.href = FAVICON;
  document.title = 'Finance Overview';
}

export {};
