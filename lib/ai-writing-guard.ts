import type { WritingTarget } from './ai-writing';

/** Imported edits use the same validators and atomic version checks as manual saves. */
export async function writingSaveError(form: FormData, target: WritingTarget): Promise<string | undefined> {
  if (form.get('aiWritingImport') !== 'true') return;
  const expected = String(form.get('expectedUpdatedAt') ?? 'new');
  const { sameWriting } = await import('./ai-writing');
  let importedTarget: unknown;
  try { importedTarget = JSON.parse(String(form.get('aiWritingPage') ?? '')); }
  catch { return 'The import has no page identity. Undo it and upload the JSON again.'; }
  if (!sameWriting(target, importedTarget)) return 'The page URL changed after importing. Undo the import before changing its destination.';
  // The caller already authenticates. Keep the shared check below server actions.
  const { writingEligibility } = await import('./ai-writing-server');
  const result = await writingEligibility(target, expected);
  return result.ok ? undefined : result.error;
}
