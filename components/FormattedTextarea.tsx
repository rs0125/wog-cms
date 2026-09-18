'use client';

import { useId, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { toggleTextFormat, type TextFormat } from '../lib/text-formatting';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'defaultValue' | 'value'> & { value: string };

export default function FormattedTextarea({ id, onKeyDown, disabled, readOnly, ...props }: Props) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const field = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    if (selection.current && field.current) {
      field.current.setSelectionRange(selection.current.start, selection.current.end);
      selection.current = null;
    }
  });

  function format(style: TextFormat) {
    const textarea = field.current;
    if (!textarea || disabled || readOnly) return;
    const next = toggleTextFormat(textarea.value, textarea.selectionStart, textarea.selectionEnd, style);
    if (props.maxLength !== undefined && next.value.length > props.maxLength) return;
    selection.current = next;
    textarea.focus({ preventScroll: true });
    // Use the native setter and input event so React's existing onChange and
    // the form's onInput both run, including its unsaved-changes indicator.
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(textarea, next.value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.setSelectionRange(next.start, next.end);
  }

  return (
    <div className="w-full min-w-0" data-formatting-field>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Text formatting">
        {(['bold', 'italic'] as const).map(style => (
          <button
            key={style}
            type="button"
            aria-controls={fieldId}
            aria-keyshortcuts={style === 'bold' ? 'Control+b Meta+b' : 'Control+i Meta+i'}
            title={`${style === 'bold' ? 'Bold' : 'Italic'} (Ctrl/Cmd+${style === 'bold' ? 'B' : 'I'})`}
            disabled={disabled || readOnly}
            className={`cms-btn px-2.5 py-1 text-xs ${style === 'bold' ? 'font-bold' : 'italic'}`}
            onMouseDown={event => event.preventDefault()}
            onClick={() => format(style)}
          >
            {style === 'bold' ? 'Bold' : 'Italic'}
          </button>
        ))}
        <span className="text-xs font-normal normal-case tracking-normal text-wareongo-slate">Select text to format</span>
      </div>
      <textarea
        {...props}
        ref={field}
        id={fieldId}
        disabled={disabled}
        readOnly={readOnly}
        onKeyDown={event => {
          onKeyDown?.(event);
          if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || disabled || readOnly) return;
          const key = event.key.toLowerCase();
          if ((event.ctrlKey || event.metaKey) && (key === 'b' || key === 'i')) {
            event.preventDefault();
            format(key === 'b' ? 'bold' : 'italic');
          }
        }}
      />
    </div>
  );
}
