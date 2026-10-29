/** Icônes SVG en ligne (aucune ressource externe). */

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  pause: svg('<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>'),
  play: svg('<path d="M8 5.5v13l10.5-6.5z"/>'),
  slower: svg('<path d="M11.5 6 5 12l6.5 6M19 6l-6.5 6 6.5 6"/>'),
  faster: svg('<path d="M12.5 6 19 12l-6.5 6M5 6l6.5 6L5 18"/>'),
  now: svg('<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>'),
  settings: svg(
    '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  ),
  regions: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.3 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.3-3.8-8.5s1.2-6.1 3.8-8.5z"/>'),
  zoomIn: svg('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5M10.5 8v5"/>'),
  zoomOut: svg('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5"/>'),
  recenter: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'),
  overview: svg('<circle cx="12" cy="12" r="2.5"/><ellipse cx="12" cy="12" rx="9.5" ry="4.5"/><circle cx="20" cy="10.6" r="1.2"/>'),
  // Planète et satellite sur son orbite.
  satellites: svg('<circle cx="10" cy="13" r="5"/><path d="M3.4 9.2a10 4.6 -20 0 1 18.4-4.4"/><circle cx="19.2" cy="5.6" r="1.8"/>'),
  sun: svg(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  ),
  // Retour à la planète (flèche vers un disque).
  parent: svg('<circle cx="15" cy="12" r="6"/><path d="M9.5 12H2.8M5.6 8.8 2.6 12l3 3.2"/>'),
};
