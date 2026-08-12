'use client';

import { useRef, useState } from 'react';
import { MAX_IMAGES, type GuideImage, type GuideImagesBlock } from '@/lib/guide-schema';
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
}: {
  block: GuideImagesBlock;
  onChange: (next: GuideImagesBlock) => void;
}) {
  const { images, caption } = block;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const room = MAX_IMAGES - images.length;
  const setImages = (next: GuideImage[]) => onChange({ ...block, images: next });

  async function addFiles(picked: File[]) {
    setError(null);
    // Uploaded one at a time — a batch of four phone photos in parallel is a lot
    // of canvas work at once, and one-at-a-time means the button can name the
    // file it's on. Whatever succeeded is committed in a single change at the
    // end: partial success survives a mid-batch failure, and there's exactly one
    // write back into the block rather than one per file.
    let next: GuideImage[] = images;
    const problems: string[] = [];

    for (const file of picked.slice(0, room)) {
      setBusy(file.name);
      try {
        const uploaded = await uploadImage(file);
        // Same bytes as one already here: the content-addressed key makes this
        // the identical URL, which would also collide as a React key.
        if (next.some((img) => img.url === uploaded.url)) {
          problems.push(`${file.name} is already in this block.`);
          continue;
        }
        next = [...next, uploaded];
      } catch (err) {
        problems.push(err instanceof Error ? err.message : `${file.name} could not be uploaded.`);
      }
    }

    if (picked.length > room) {
      problems.push(`A block holds at most ${MAX_IMAGES} images — the extra files were skipped.`);
    }
    setBusy(null);
    if (next.length !== images.length) setImages(next);
    setError(problems.join(' ') || null);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-wareongo-slate">{COLLAGE_LABEL[images.length] ?? ''}</p>

      {images.length > 0 && (
        <div className="space-y-2">
          {images.map((img, i) => (
            <div key={img.url} className="flex gap-3 rounded-xl border border-wareongo-blue/15 bg-white p-2">
              {/* Straight from R2 — this app runs with next/image unoptimized
                  (see next.config.ts), so a plain img is the honest choice. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt=""
                className="h-20 w-20 shrink-0 rounded-lg border border-wareongo-blue/15 bg-wareongo-blue/5 object-cover"
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
                  <span className="text-[11px] text-wareongo-slate">
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
        <span className="text-[11px] text-wareongo-slate">
          Resized to 1600px and converted to WebP in the browser before upload.
        </span>
      </div>

      {error && <p className="text-xs text-wareongo-sienna">{error}</p>}

      <input
        value={caption}
        placeholder="Caption (optional) — shown under the whole group"
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
        className="cms-input py-1.5 text-sm"
      />
    </div>
  );
}

const reorder = (images: GuideImage[], from: number, to: number): GuideImage[] => {
  if (to < 0 || to >= images.length) return images;
  const next = [...images];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
};
