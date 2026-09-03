// Result shapes shared by every content section's server actions.
//
// They live here rather than in one section's actions file so the form and
// toggle components can be written against the shape instead of against blogs
// specifically, and a second section doesn't fork them.

export type SaveResult = { ok: false; error: string } | { ok: true };

/** `listed` is the state the record ended up in; `at` distinguishes one toggle from the next. */
export type ListingResult = { ok: true; listed: boolean; at: number } | { ok: false; error: string };
