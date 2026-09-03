'use client';

import { useRef, useState } from 'react';
import type { MicromarketImage } from '@/lib/micromarket-schema';
import { uploadImage } from '@/lib/image-upload';

/**
 * One optional figure: pick a file, it downscales and uploads to R2 in the
 * browser (lib/image-upload.ts), then the alt text is typed here.
 *
 * Deliberately not ImagesEditor. That component owns a *block* of up to four
 * images whose collage layout follows from the count; these are two fixed slots
 * in a page template, cropped to a ratio the layout already decided, so a
 * multi-image editor would offer choices the page can't honour.
 */
export default function SingleImagePicker({
  value,
  onChange,
  /** The crop the page will apply, so the editor knows what will survive. */
  ratio,
}: {
  value: MicromarketImage | null;
  onChange: (next: MicromarketImage | null) => void;
  ratio: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    setError(null);
    setBusy(true);
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That image could not be uploaded.');
    } finally {
      setBusy(false);
      // Cleared so re-picking the same file fires a change event again.
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex gap-3 rounded-xl border border-wareongo-blue/15 bg-white p-2">
          {/* Straight from R2 — this app runs with next/image unoptimized
              (see next.config.ts), so a plain img is the honest choice. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.url}
            alt=""
            className="h-20 w-20 shrink-0 rounded-lg border border-wareongo-blue/15 bg-wareongo-blue/5 object-cover"
          />
          <div className="min-w-0 flex-1">
            <input
              value={value.alt}
              placeholder="Alt text — what the image shows (required)"
              onChange={(e) => onChange({ ...value, alt: e.target.value })}
              className="cms-input mb-1.5 py-1.5 text-sm"
            />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-wareongo-slate">
                {value.width}×{value.height} · shown at {ratio}
              </span>
              {/* The object stays in R2. Deleting it here would break any
                  already-deployed build that still points at it. */}
              <button
                type="button"
                className="cms-btn-danger ml-auto"
                onClick={() => onChange(null)}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="cms-btn"
        >
          {busy ? 'Uploading…' : `+ Image (${ratio})`}
        </button>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pick(file);
        }}
      />

      {error && <p className="text-xs text-wareongo-sienna">{error}</p>}
    </div>
  );
}
