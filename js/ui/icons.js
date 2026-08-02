/**
 * Inline SVG icons used by the side panel.
 *
 * The extension's CSP forbids remote scripts, and an icon font would be a
 * fifth network asset for eleven glyphs — so the paths are inlined here and
 * built as real DOM nodes. `innerHTML` is deliberately avoided: everything
 * goes through `createElementNS`, which keeps the panel free of any HTML
 * string parsing even though these strings are static.
 *
 * Paths follow the Lucide outline set the design was drawn with.
 */

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const DEFAULT_STROKE_WIDTH = 2.75;
const DEFAULT_SIZE = 17;

/** Path data per icon, in a 24×24 viewBox. */
const ICON_PATHS = Object.freeze({
  quote: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M16 13H8', 'M16 17H8'],
  card: ['M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M2 10h20'],
  coffee: ['M10 2v2', 'M14 2v2', 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1', 'M6 2v2'],
  checkin: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z', 'm16 11 2 2 4-4'],
  copy: ['M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'],
  pencil: ['M21.2 6.8a1 1 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z', 'm15 5 4 4'],
  refresh: ['M3 12a9 9 0 0 1 9-9 9.8 9.8 0 0 1 6.7 2.7L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.8 9.8 0 0 1-6.7-2.7L3 16', 'M8 16H3v5'],
  alert: ['M12 9v4', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 17h.01'],
  check: ['M20 6 9 17l-5-5'],
  external: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
  send: ['m22 2-7 20-4-9-9-4Z', 'M22 2 11 13'],
});

/** Sparkle is the one solid glyph — it reads as a filled star at 17px. */
const FILLED_ICON_PATHS = Object.freeze({
  sparkle: ['M9.9 15.5A2 2 0 0 0 8.5 14.1l-6.1-1.6a.5.5 0 0 1 0-1L8.5 9.9A2 2 0 0 0 9.9 8.5l1.6-6.1a.5.5 0 0 1 1 0l1.6 6.1a2 2 0 0 0 1.4 1.4l6.1 1.6a.5.5 0 0 1 0 1l-6.1 1.6a2 2 0 0 0-1.4 1.4l-1.6 6.1a.5.5 0 0 1-1 0z'],
});

export class UnknownIconError extends Error {
  constructor(name) {
    super(`Unknown icon: ${name}`);
    this.name = 'UnknownIconError';
  }
}

/**
 * Builds an icon as an SVG element that inherits the parent's text colour.
 *
 * @param {string} name Key of ICON_PATHS or FILLED_ICON_PATHS.
 * @param {{ size?: number, strokeWidth?: number }} [options]
 * @returns {SVGSVGElement}
 * @throws {UnknownIconError} When the name is not part of the icon set.
 */
export function createIcon(name, options = {}) {
  const isFilled = name in FILLED_ICON_PATHS;
  const paths = isFilled ? FILLED_ICON_PATHS[name] : ICON_PATHS[name];

  if (!paths) {
    throw new UnknownIconError(name);
  }

  const size = options.size ?? DEFAULT_SIZE;
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');

  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  if (isFilled) {
    svg.setAttribute('fill', 'currentColor');
  } else {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', String(options.strokeWidth ?? DEFAULT_STROKE_WIDTH));
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  }

  for (const pathData of paths) {
    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
  }

  return svg;
}

/**
 * Replaces the contents of every `[data-icon]` element with its icon, so the
 * static markup in popup.html can declare icons without inlining SVG.
 *
 * @param {ParentNode} [root=document]
 */
export function hydrateIcons(root = document) {
  for (const host of root.querySelectorAll('[data-icon]')) {
    const size = Number(host.dataset.iconSize) || undefined;
    host.prepend(createIcon(host.dataset.icon, { size }));
  }
}
