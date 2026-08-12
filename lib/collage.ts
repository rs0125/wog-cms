// Collage geometry for an images block, derived from the image count alone:
// 1 → full width, 2 → side by side, 3 → a row of three, 4 → a 2×2.
//
// Shared between the editor (which names the layout so you know what you're
// getting) and the preview (which draws it). The live site's copy of the grid
// classes is in wareongo-website/src/pages/GuideDetail.tsx — same deliberate
// duplication as the rest of the guide renderer, for the reason in
// GuidePreview.tsx.

/** Column counts. Mobile keeps two columns rather than one, so a pair reads as a pair. */
export const COLLAGE_GRID: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2',
};

/**
 * Three tiles at a phone's width would be ~110px each, so on mobile the first
 * one spans the full width and the other two sit below it as a pair. Reading
 * order is unchanged.
 */
export const collageSpan = (count: number, index: number) =>
  count === 3 && index === 0 ? 'col-span-2 sm:col-span-1' : '';

export const COLLAGE_LABEL: Record<number, string> = {
  0: 'Add an image to start',
  1: 'One image — full width, at its own aspect ratio',
  2: 'Two side by side',
  3: 'A row of three — the first fills the width on mobile',
  4: 'A 2×2 grid',
};
