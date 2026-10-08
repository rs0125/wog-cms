'use client';

import FormattedTextarea from './FormattedTextarea';

import { useEffect, useRef, useState } from 'react';
import { MAX_IMAGES, type BlogImage, type BlogImagesBlock } from '@/lib/blog-schema';
import { COLLAGE_LABEL } from '@/lib/collage';
import { uploadImage } from '@/lib/image-upload';

// One images block: pick files, they upload straight to R2, then each gets alt
// text. The collage layout isn't chosen here — it follows from how many images
// the block holds (see lib/collage.ts), so there's nothing to keep in sync.
//
// No stable-key wrapper here, unlike the list and table editors: the object key
// is a hash of the file's contents, so its URL *is* a stable identity, and
// adding the same file twice is caught below rather than producing two entries
// that share a React key.

export default function ImagesEditor({
  block,
  onChange,
  onUploadStateChange,
}: {
  block: BlogImagesBlock;
  onChange: (next: BlogImagesBlock) => void;
  onUploadStateChange?: (uploading: boolean) => void;
}) {
  const { images, caption } = block;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const latest = useRef({ block, onChange });
  const mounted = useRef(true);
  useEffect(() => { latest.current = { block, onChange }; }, [block, onChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const room = MAX_IMAGES - images.length;
  const setImages = (next: BlogImage[]) => onChange({ ...block, images: next });

  async function addFiles(picked: File[]) {
    if (busy) return;
    setError(null);
    onUploadStateChange?.(true);
    // Uploaded one at a time — a batch of four phone photos in parallel is a lot
    // of canvas work at once, and one-at-a-time means the button can name the
    // file it's on. Whatever succeeded is committed in a single change at the
    // end: partial success survives a mid-batch failure, and there's exactly one
    // write back into the block rather than one per file.
    const added: BlogImage[] = [];
    const problems: string[] = [];

    for (const file of picked.slice(0, room)) {
      setBusy(file.name);
      try {
        const uploaded = await uploadImage(file);
        // Same bytes as one already here: the content-addressed key makes this
        // the identical URL, which would also collide as a React key.
        if ([...latest.current.block.images, ...added].some((img) => img.url === uploaded.url)) {
          problems.push(`${file.name} is already in this block.`);
          continue;
        }
        added.push(uploaded);
      } catch (err) {
        problems.push(err instanceof Error ? err.message : `${file.name} could not be uploaded.`);
      }
    }

    if (picked.length > room) {
      problems.push(`A block holds at most ${MAX_IMAGES} images — the extra files were skipped.`);
    }
    if (mounted.current) {
      setBusy(null);
      const current = latest.current;
      if (added.length) current.onChange({ ...current.block, images: [...current.block.images, ...added].slice(0, MAX_IMAGES) });
      setError(problems.join(' ') || null);
    }
    onUploadStateChange?.(false);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-wareongo-slate">{COLLAGE_LABEL[images.length] ?? ''}</p>

      {images.length > 0 && (
        <div className="space-y-2">
          {images.map((img, i) => (
            <div key={img.url} className="flex gap-3 rounded-xl border border-ui-line bg-ui-surface p-2">
              {/* Straight from R2 — this app runs with next/image unoptimized
                  (see next.config.ts), so a plain img is the honest choice. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt=""
                className="h-20 w-20 shrink-0 rounded-lg border border-ui-line bg-ui-tint object-cover"
              />
              <div className="min-w-0 flex-1">
                <input
                  value={img.alt}
                  placeholder="Alt text — what the image shows (required)"
                  onChange={(e) =>
                    setImages(images.map((it, j) => (j === i ? { ...it, alt: e.target.value } : it)))
                  }
                  className="cms-input mb-1.5 py-1.5 text-sm"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-wareongo-slate">
                    {img.width}×{img.height}
                  </span>
                  <div className="ml-auto flex gap-1">
                    <button
                      type="button"
                      className="cms-btn"
                      onClick={() => setImages(reorder(images, i, i - 1))}
                      disabled={i === 0}
                      aria-label="Move earlier"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="cms-btn"
                      onClick={() => setImages(reorder(images, i, i + 1))}
                      disabled={i === images.length - 1}
                      aria-label="Move later"
                    >
                      →
                    </button>
                    {/* The object stays in R2. Deleting it here would break any
                        already-deployed build that still points at it. */}
                    <button
                      type="button"
                      className="cms-btn-danger"
                      onClick={() => setImages(images.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        disabled={busy !== null}
        className="hidden"
        // No `name`: this input is never part of the form submission — the files
        // are already in R2 by the time anything is saved.
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (picked.length > 0) void addFiles(picked);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="cms-btn"
          onClick={() => fileInput.current?.click()}
          disabled={room === 0 || busy !== null}
        >
          {busy ? `Uploading ${busy}…` : room === 0 ? `${MAX_IMAGES} images — full` : '+ Images'}
        </button>
        <span className="text-xs text-wareongo-slate">
          Resized to 1600px and converted to WebP in the browser before upload.
        </span>
      </div>

      {error && <p className="text-xs text-wareongo-sienna">{error}</p>}

      <FormattedTextarea
        rows={1}
        value={caption}
        placeholder="Caption (optional) — shown under the whole group"
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
        className="cms-input py-1.5 text-sm"
      />
    </div>
  );
}

const reorder = (images: BlogImage[], from: number, to: number): BlogImage[] => {
  if (to < 0 || to >= images.length) return images;
  const next = [...images];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
};
