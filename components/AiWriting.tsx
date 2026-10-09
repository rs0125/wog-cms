'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from '@/components/CmsLink';
import { checkWritingImport } from '@/app/(authed)/writing-actions';
import {
  MAX_WRITING_BYTES, applyWritingChanges, canonicalWriting, parseWritingJson,
  protectedWritingIssues, readableWriting, sameWriting, trackWritingChanges, undoWritingChanges, validateWriting,
  writingChanges, writingComplete, writingTargetSchema, writingTemplate,
  type WritingChange, type WritingIssue, type WritingTarget, type WritingValues,
} from '@/lib/ai-writing';

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function fieldElement(form: HTMLFormElement, path: string): HTMLElement | null {
  const parts = path.split('.');
  while (parts.length) {
    const selector = CSS.escape(parts.join('.'));
    const exact = form.querySelector<HTMLElement>(`[data-writing-path="${selector}"], [id="${selector}"], [name="${selector}"]:not([type="hidden"])`);
    if (exact) return exact.matches('input, textarea, select, button') ? exact
      : exact.querySelector<HTMLElement>('textarea') ?? exact.querySelector<HTMLElement>('input:not([type="hidden"]), select, button') ?? exact;
    parts.pop();
  }
  return null;
}

export default function AiWriting({ target, initial, values, onChange, onReveal, expectedUpdatedAt = 'new', disabled = false, lockedReason,
  check = checkWritingImport,
}: {
  target: WritingTarget; initial: WritingValues; values: WritingValues;
  onChange: (values: WritingValues) => void; onReveal: () => void;
  expectedUpdatedAt?: string; disabled?: boolean; lockedReason?: string;
  check?: typeof checkWritingImport;
}) {
  const uid = useId();
  const root = useRef<HTMLDetailsElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const readVersion = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [raw, setRaw] = useState('');
  const [paste, setPaste] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [session, setSession] = useState<WritingChange[]>([]);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [sessionTarget, setSessionTarget] = useState('');
  const targetKey = canonicalWriting(target);
  const identity = writingTargetSchema.safeParse(target);
  const identityReady = identity.success;
  const identityField = identity.success ? 'slug' : String(identity.error.issues.find(i => ['slug', 'citySlug'].includes(String(i.path[0])))?.path[0] ?? 'slug');
  const complete = writingComplete(target.type, initial) || (!session.length && writingComplete(target.type, values));
  const locked = lockedReason || (complete ? 'This page already has its required writing. You can download its template; make changes in the editor.' : '');
  const cannotImport = disabled || busy || reading || Boolean(locked) || !identityReady;
  const destinationChanged = Boolean(sessionTarget && sessionTarget !== targetKey);
  const latest = useRef({ values, target, disabled, expectedUpdatedAt, locked });
  useEffect(() => { latest.current = { values, target, disabled, expectedUpdatedAt, locked }; }, [values, target, disabled, expectedUpdatedAt, locked]);
  const { type, slug, citySlug } = target;
  const parsed = useMemo(() => raw.trim() ? parseWritingJson(raw, { type, slug, ...(citySlug === undefined ? {} : { citySlug }) })
    : { issues: [] as WritingIssue[] }, [raw, type, slug, citySlug]);
  const changes = parsed.content ? writingChanges(target.type, values, parsed.content).map(c => ({ ...c,
    // Corrected uploads can update untouched values from this same unsaved import.
    replacement: c.replacement && !session.some(s => s.path === c.path && sameWriting(c.before, s.after)),
  })) : [];
  const chosen = changes.filter(c => !c.replacement || selected[c.path] === canonicalWriting(c));
  const proposal = applyWritingChanges(values, chosen);
  const protectedIssues = parsed.content ? protectedWritingIssues(target.type, values, proposal) : [];
  const contentIssues = parsed.content && chosen.length ? validateWriting(target.type, proposal) : [];
  const appliedIssues = session.length && !raw.trim() ? validateWriting(target.type, values) : [];
  const displayedIssues = [...parsed.issues, ...protectedIssues, ...contentIssues, ...appliedIssues];
  const replacements = changes.filter(c => c.replacement);
  const fills = changes.filter(c => !c.replacement);
  const issuesKey = canonicalWriting(appliedIssues);

  useEffect(() => {
    const form = root.current?.closest('form');
    if (!form) return;
    const issues: WritingIssue[] = JSON.parse(issuesKey);
    const marked = new Map<HTMLElement, [string | null, string | null]>();
    for (const [index, issue] of issues.slice(0, 50).entries()) {
      const field = fieldElement(form, issue.path);
      if (!field || marked.has(field)) continue;
      marked.set(field, [field.getAttribute('aria-invalid'), field.getAttribute('aria-describedby')]);
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), `${uid}-issue-${index}`].filter(Boolean).join(' '));
    }
    return () => { for (const [field, attrs] of marked) ['aria-invalid', 'aria-describedby'].forEach((key, i) => {
      if (attrs[i] === null) field.removeAttribute(key); else field.setAttribute(key, attrs[i]!);
    }); };
  }, [issuesKey, uid]);

  function reveal(path: string) {
    onReveal();
    requestAnimationFrame(() => {
      const form = root.current?.closest('form');
      const field = form && fieldElement(form, path);
      if (!field) return;
      let parent = field.parentElement;
      while (parent && parent !== form) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
      field.scrollIntoView({ behavior: 'smooth', block: 'center' }); field.focus({ preventScroll: true });
    });
  }
  function resetUpload() {
    readVersion.current++;
    setReading(false); setRaw(''); setSelected({}); setError(''); setNotice('');
  }
  function focusNotice() { requestAnimationFrame(() => noticeRef.current?.focus({ preventScroll: true })); }
  async function readFile(file: File | undefined) {
    if (!file) return;
    resetUpload();
    const version = readVersion.current;
    const isCurrent = () => mounted.current && version === readVersion.current;
    if (file.size > MAX_WRITING_BYTES) { setError('This file is too large. Choose one page under 750 KB.'); return; }
    setReading(true);
    try {
      const text = await file.text();
      if (isCurrent()) setRaw(text);
    } catch {
      if (isCurrent()) setError('Could not read that file. Try selecting it again, or paste its JSON.');
    } finally { if (isCurrent()) setReading(false); }
  }
  async function apply() {
    if (cannotImport || destinationChanged || parsed.issues.length || protectedIssues.length || !chosen.length) return;
    const snapshot = canonicalWriting(values), identity = targetKey;
    setBusy(true); setError('');
    try {
      const result = await check(target, expectedUpdatedAt);
      if (!mounted.current) return;
      if (!result.ok) { setError(result.error); return; }
      if (canonicalWriting(latest.current.values) !== snapshot || canonicalWriting(latest.current.target) !== identity
        || latest.current.disabled || latest.current.locked || latest.current.expectedUpdatedAt !== expectedUpdatedAt) {
        setSelected({}); setError('The editor changed while this import was being checked. Review the updated comparison and apply again.'); return;
      }
      setSession(trackWritingChanges(session, chosen)); setSessionTarget(identity);
      onChange(proposal);
      setRaw(''); setSelected({}); setPaste(false);
      const preserved = replacements.length - chosen.filter(c => c.replacement).length;
      setNotice(`${chosen.length} ${chosen.length === 1 ? 'field' : 'fields'} applied to the editor.${preserved ? ` ${preserved} existing ${preserved === 1 ? 'field kept' : 'fields kept'}.` : ''} Review and save when ready.`);
      onReveal(); focusNotice();
    } catch { setError('Could not check this page. Your JSON is kept here. Try again.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function copyCorrections() {
    const text = `Fix this WareOnGo page JSON. Keep the page identity and existing copy unless a correction requires a change. Return the complete JSON file.\n\n${displayedIssues.map(i => `${i.path || 'JSON'} (${i.label}): ${i.message}`).join('\n')}\n\n${raw || JSON.stringify(writingTemplate(target, values), null, 2)}`;
    try { await navigator.clipboard.writeText(text); setNotice('Correction instructions copied. Paste them into your AI conversation.'); }
    catch { download(text, `${target.slug}-corrections.txt`); setNotice('Correction instructions downloaded.'); }
  }
  return <details ref={root} className="cms-card mb-6 min-w-0" onInput={event => event.stopPropagation()} data-ai-writing>
    <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-wareongo-blue">AI writing <span className="ml-2 font-normal text-wareongo-slate">Template and JSON import</span></summary>
    <div className="mt-4 min-w-0 space-y-4">
      <p className="text-sm text-wareongo-slate">Download this page&apos;s writing template, fill it with AI, then upload the JSON here. Empty fields fill first. Existing copy changes only when you select its replacement.</p>
      {!identityReady && <p className="cms-hint">Set a valid page slug{target.type === 'micromarket' ? ' and city slug' : ''} first, using lowercase letters, numbers and single hyphens. This ties your file to the right page. <button type="button" className="min-h-11 underline" onClick={() => reveal(identityField)}>Set page URL</button></p>}
      {locked && <p className="text-sm text-wareongo-slate">{locked}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="cms-btn" disabled={!identityReady || busy} onClick={() => download(JSON.stringify(writingTemplate(target, values), null, 2), `${target.type}-${target.slug}-writing.json`)}>Download writing template</button>
        <button type="button" className="cms-btn" disabled={cannotImport} onClick={() => fileInput.current?.click()}>Upload JSON</button>
        <button type="button" className="cms-btn" disabled={cannotImport} aria-expanded={paste} aria-controls={`${uid}-paste`} onClick={() => setPaste(p => !p)}>{raw.trim() ? 'Edit JSON' : 'Paste JSON'}</button>
        <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" aria-label="Choose page JSON" disabled={cannotImport} onChange={event => { void readFile(event.target.files?.[0]); event.target.value = ''; }} />
      </div>
      {paste && <div id={`${uid}-paste`}>
        <label htmlFor={`${uid}-json`} className="cms-label">Page JSON</label>
        <textarea id={`${uid}-json`} value={raw} rows={8} spellCheck={false} className="cms-input font-mono" placeholder="Paste the completed template here" disabled={busy || reading} onChange={event => { setRaw(event.target.value); setSelected({}); setError(''); setNotice(''); }} />
      </div>}
      {reading && <p role="status" className="text-sm">Reading JSON…</p>}
      {error && <p role="alert" className="break-words text-sm text-red-700">{error}{error.includes('Context Engine') && <> <Link href="/imports" className="underline">Open Content imports</Link></>}</p>}
      {notice && <p ref={noticeRef} tabIndex={-1} role="status" className="text-sm text-wareongo-blue">{notice}</p>}
      {session.length > 0 && <>
        <input type="hidden" name="aiWritingImport" value="true" />
        <input type="hidden" name="aiWritingPage" value={sessionTarget} />
        {sessionTarget !== targetKey && <p role="alert" className="text-sm text-red-700">The page URL changed after importing. Undo this import before using JSON for a different page.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="cms-btn" disabled={disabled || busy || reading} onClick={() => {
            onChange(undoWritingChanges(values, session)); setSession([]); setSessionTarget(''); setNotice('Imported values undone. Fields you edited afterwards were kept, including any imported copy still in those fields.'); setError(''); focusNotice();
          }}>Undo import</button>
          <button type="button" className="cms-btn" onClick={() => download(JSON.stringify(writingTemplate(target, values), null, 2), `${target.slug}-current-writing.json`)}>Download current writing</button>
        </div>
        <p className="cms-hint">The download contains writing fields. Save photos and other page settings using the editor.</p>
      </>}
      {raw.trim() && parsed.content && <div className="space-y-3 border-t border-ui-line pt-4">
        <p role="status" className="text-sm font-medium">{!changes.length ? 'No new changes in this file.' : `${fills.length} ${fills.length === 1 ? 'field ready' : 'fields ready'} · ${replacements.length} existing ${replacements.length === 1 ? 'field differs' : 'fields differ'}`}</p>
        {fills.length > 0 && <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3">Review fields to apply</summary><ul className="mt-2 space-y-3">{fills.map(c => <li key={c.path}><strong>{c.label}</strong><p className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words">{readableWriting(c.after)}</p></li>)}</ul></details>}
        {replacements.length > 0 && <details className="rounded-lg border border-ui-outline p-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Review replacements ({replacements.length})</summary>
          <p className="my-3 text-sm text-wareongo-slate">Select only the fields you want to replace. Unchecked fields keep the editor&apos;s current copy.</p>
          <div className="space-y-5">{replacements.map(c => <section key={c.path}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold"><input type="checkbox" className="h-5 w-5" disabled={cannotImport} checked={selected[c.path] === canonicalWriting(c)} onChange={event => setSelected(s => ({ ...s, [c.path]: event.target.checked ? canonicalWriting(c) : '' }))} />Replace {c.label}</label>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-lg border border-red-200 bg-red-50 p-3"><p className="mb-2 text-xs font-semibold text-red-800">Before · current editor</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{readableWriting(c.before)}</pre></div>
              <div className="min-w-0 rounded-lg border border-green-200 bg-green-50 p-3"><p className="mb-2 text-xs font-semibold text-green-800">After · imported copy</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{readableWriting(c.after)}</pre></div>
            </div>
          </section>)}</div>
        </details>}
      </div>}
      {displayedIssues.length > 0 && <div className="rounded-lg border border-red-200 p-3" role="region" aria-label="Writing corrections">
        <p className="mb-2 text-sm font-semibold">{parsed.issues.length || protectedIssues.length ? 'Fix these items in your JSON before applying' : 'Content needs attention'}</p>
        <ul className="space-y-3 text-sm">{displayedIssues.slice(0, 50).map((issue, index) => <li key={`${issue.path}-${index}`} id={`${uid}-issue-${index}`}>
          <strong>{issue.label || 'JSON'}</strong>: {issue.message}
          {!!appliedIssues.length && <button type="button" className="ml-2 min-h-11 underline" onClick={() => reveal(issue.path)}>Go to field</button>}
        </li>)}</ul>
        {displayedIssues.length > 50 && <p className="mt-2 text-sm">Showing the first 50 issues. Copy instructions to get the full list.</p>}
        <button type="button" className="cms-btn mt-3" onClick={() => void copyCorrections()}>Copy correction instructions</button>
      </div>}
      {(raw.trim() || reading) && <div className="flex flex-wrap items-center gap-2">
        {parsed.content && <button type="button" className="cms-btn-primary" disabled={cannotImport || !chosen.length || Boolean(protectedIssues.length) || destinationChanged} onClick={() => void apply()}>
          {busy ? 'Checking page…' : contentIssues.length ? 'Apply to editor and fix fields' : 'Apply selected changes'}
        </button>}
        <button type="button" className="cms-btn" disabled={busy} onClick={resetUpload}>Cancel import</button>
        {(error || parsed.issues.length > 0) && <button type="button" className="cms-btn" onClick={() => download(raw, `${target.slug || 'page'}-uploaded.json`)}>Download uploaded JSON</button>}
      </div>}
      <p className="text-xs text-wareongo-slate">One page per file. Applying changes only fills the editor; use its save and publishing controls when ready.</p>
    </div>
  </details>;
}
