export type TextFormat = 'bold' | 'italic';

/** Keep the selection on the words so another click can combine or remove formatting. */
export function toggleTextFormat(value: string, start: number, end: number, format: TextFormat) {
  const marker = format === 'bold' ? '**' : '*';
  const width = marker.length;
  const selected = value.slice(start, end);
  const hasFormat = (run: number) => format === 'bold' ? run >= 2 : run % 2 === 1;
  const leadingStars = (text: string) => text.match(/^\*+/)?.[0].length ?? 0;
  const trailingStars = (text: string) => text.match(/\*+$/)?.[0].length ?? 0;

  if (hasFormat(leadingStars(selected)) && hasFormat(trailingStars(selected)) && selected.length > width * 2) {
    const text = selected.slice(width, -width);
    return { value: value.slice(0, start) + text + value.slice(end), start, end: start + text.length };
  }
  if (hasFormat(trailingStars(value.slice(0, start))) && hasFormat(leadingStars(value.slice(end)))) {
    return {
      value: value.slice(0, start - width) + selected + value.slice(end + width),
      start: start - width,
      end: end - width,
    };
  }

  // Put spaces outside the markers, including when selecting a whole paragraph.
  const leading = selected.match(/^\s*/)?.[0] ?? '';
  const text = selected.trim() || (format === 'bold' ? 'bold text' : 'italic text');
  const trailing = selected.trim() ? selected.match(/\s*$/)?.[0] ?? '' : '';
  const nextStart = start + leading.length + width;
  return {
    value: value.slice(0, start) + leading + marker + text + marker + trailing + value.slice(end),
    start: nextStart,
    end: nextStart + text.length,
  };
}
