'use client';

import { useState } from 'react';
import ImagesEditor from './ImagesEditor';
import { BLOCK_KINDS, emptyBlock, type GuideBlock } from '@/lib/guide-schema';
import { keyAll, keyed, removeAt, replaceAt, swap, unkey, type Keyed } from '@/lib/keyed';

const KIND_LABEL: Record<GuideBlock['kind'], string> = {
  h2: 'Heading 2',
  h3: 'Heading 3',
  p: 'Paragraph',
  ul: 'Bulleted list',
  ol: 'Numbered list',
  table: 'Table',
  images: 'Images',
};

// Shared classes live in app/globals.css so the CMS and the site keep one idiom.
const btn = 'cms-btn';
const danger = 'cms-btn-danger';
const field = 'cms-input';

export default function BlockEditor({
  blocks,
  onChange,
}: {
  blocks: Keyed<GuideBlock>[];
  onChange: (next: Keyed<GuideBlock>[]) => void;
}) {
  return (
    <div className="space-y-3">
      {blocks.map(({ key, value: block }, i) => (
        // key comes from the item, not its position, so reordering moves the
        // DOM node with the block instead of leaving focus behind.
        <div key={key} className="cms-card">
          <div className="mb-2 flex items-center gap-2">
            <select
              value={block.kind}
              onChange={(e) => onChange(replaceAt(blocks, i, emptyBlock(e.target.value as GuideBlock['kind'])))}
              className="rounded-lg border border-wareongo-blue/25 bg-white px-2.5 py-1.5 text-xs text-wareongo-blue"
            >
              {BLOCK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <span className="text-xs text-wareongo-slate">#{i + 1}</span>
            <div className="ml-auto flex gap-1">
              <button type="button" className={btn} onClick={() => onChange(swap(blocks, i, i - 1))} disabled={i === 0}>
                ↑
              </button>
              <button
                type="button"
                className={btn}
                onClick={() => onChange(swap(blocks, i, i + 1))}
                disabled={i === blocks.length - 1}
              >
                ↓
              </button>
              <button type="button" className={danger} onClick={() => onChange(removeAt(blocks, i))}>
                Remove
              </button>
            </div>
          </div>

          {(block.kind === 'h2' || block.kind === 'h3' || block.kind === 'p') && (
            <textarea
              value={block.text}
              rows={block.kind === 'p' ? 4 : 1}
              onChange={(e) => onChange(replaceAt(blocks, i, { ...block, text: e.target.value }))}
              className={field}
            />
          )}

          {(block.kind === 'ul' || block.kind === 'ol') && (
            <ListItems
              items={block.items}
              onChange={(items) => onChange(replaceAt(blocks, i, { ...block, items }))}
            />
          )}

          {block.kind === 'table' && (
            <TableEditor
              table={block.table}
              onChange={(table) => onChange(replaceAt(blocks, i, { ...block, table }))}
            />
          )}

          {block.kind === 'images' && (
            <ImagesEditor block={block} onChange={(next) => onChange(replaceAt(blocks, i, next))} />
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {BLOCK_KINDS.map((k) => (
          <button key={k} type="button" className={btn} onClick={() => onChange([...blocks, keyed(emptyBlock(k))])}>
            + {KIND_LABEL[k]}
          </button>
        ))}
      </div>
    </div>
  );
}

// Owns its own keys: this component is the only editor of the array, so keys
// assigned here can't drift from the parent's copy. Deleting item 2 of 5 would
// otherwise shift every index below it and strand the caret.
function ListItems({ items, onChange }: { items: string[]; onChange: (next: string[]) => void }) {
  const [keys, setKeys] = useState<Keyed<string>[]>(() => keyAll(items));

  const push = (next: Keyed<string>[]) => {
    setKeys(next);
    onChange(unkey(next));
  };

  return (
    <div className="space-y-2">
      {keys.map(({ key, value }, i) => (
        <div key={key} className="flex gap-2">
          <textarea
            value={value}
            rows={2}
            onChange={(e) => push(replaceAt(keys, i, e.target.value))}
            className={field}
          />
          <button
            type="button"
            className={danger}
            onClick={() => push(removeAt(keys, i))}
            disabled={keys.length === 1}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className={btn} onClick={() => push([...keys, keyed('')])}>
        + item
      </button>
    </div>
  );
}

function TableEditor({
  table,
  onChange,
}: {
  table: { headers: string[]; rows: string[][] };
  onChange: (next: { headers: string[]; rows: string[][] }) => void;
}) {
  const { headers, rows } = table;

  // Columns are added and removed across headers and every row together, so the
  // rectangle stays intact — the schema rejects ragged rows on save.
  const addColumn = () => onChange({ headers: [...headers, ''], rows: rows.map((r) => [...r, '']) });
  const removeColumn = (c: number) =>
    onChange({ headers: headers.filter((_, j) => j !== c), rows: rows.map((r) => r.filter((_, j) => j !== c)) });

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {headers.map((h, c) => (
                <th key={c} className="border border-wareongo-blue/20 p-1">
                  <input
                    value={h}
                    placeholder={`Header ${c + 1}`}
                    onChange={(e) =>
                      onChange({ ...table, headers: headers.map((v, j) => (j === c ? e.target.value : v)) })
                    }
                    className="w-full bg-transparent px-1 py-1 text-xs font-semibold text-wareongo-blue outline-none"
                  />
                  <button
                    type="button"
                    className="text-[10px] text-wareongo-sienna disabled:opacity-30"
                    onClick={() => removeColumn(c)}
                    disabled={headers.length === 1}
                  >
                    remove col
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className="border border-wareongo-blue/20 p-1">
                    <input
                      value={cell}
                      onChange={(e) =>
                        onChange({
                          ...table,
                          rows: rows.map((rr, j) => (j === r ? rr.map((v, k) => (k === c ? e.target.value : v)) : rr)),
                        })
                      }
                      className="w-full bg-transparent px-1 py-1 text-xs text-wareongo-charcoal outline-none"
                    />
                  </td>
                ))}
                <td className="p-1">
                  <button
                    type="button"
                    className="text-[10px] text-wareongo-sienna disabled:opacity-30"
                    onClick={() => onChange({ ...table, rows: rows.filter((_, j) => j !== r) })}
                    disabled={rows.length === 1}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className={btn}
          onClick={() => onChange({ ...table, rows: [...rows, headers.map(() => '')] })}
        >
          + row
        </button>
        <button type="button" className={btn} onClick={addColumn}>
          + column
        </button>
      </div>
    </div>
  );
}
