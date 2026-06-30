import type { ReactNode } from 'react';

type TextInputPanelProps = {
  id: string;
  label: string;
  helper: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  actions?: ReactNode;
  note?: string;
  error?: string | null;
  disabled?: boolean;
  summary?: ReactNode;
  textareaVisible?: boolean;
  textareaActions?: ReactNode;
  centerSummary?: boolean;
  density?: 'normal' | 'compact';
};

export function TextInputPanel({
  id,
  label,
  helper,
  placeholder,
  value,
  onChange,
  actions,
  note,
  error,
  disabled = false,
  summary,
  textareaVisible = true,
  textareaActions,
  centerSummary = false,
  density = 'normal',
}: TextInputPanelProps) {
  const isCompact = density === 'compact';

  return (
    <article
      className={`flex flex-col rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 ${isCompact ? 'min-h-[244px]' : 'min-h-[326px]'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <label htmlFor={id} className="text-sm font-semibold text-slate-950 dark:text-zinc-50">
            {label}
          </label>
          <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-zinc-300">{helper}</p>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {note || error ? (
        <div className="mt-3 min-h-5">
          {error ? (
            <p className="text-xs font-medium leading-5 text-rose-700 dark:text-rose-300">{error}</p>
          ) : (
            <p className="text-xs leading-5 text-slate-500 dark:text-zinc-400">{note}</p>
          )}
        </div>
      ) : null}
      {summary ? <div className={centerSummary ? 'flex w-full flex-1 items-center' : undefined}>{summary}</div> : null}
      {textareaVisible ? (
        <>
          {textareaActions ? <div className="mt-3 flex justify-end">{textareaActions}</div> : null}
          <textarea
            id={id}
            className={`mt-4 flex-1 resize-none rounded-md border border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-900 outline-none transition-colors duration-150 ease-out placeholder:text-slate-500 focus:border-cyan-600 focus:bg-white focus:ring-4 focus:ring-cyan-100 motion-reduce:transition-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-cyan-500 dark:focus:bg-zinc-900 dark:focus:ring-cyan-950 ${isCompact ? 'min-h-[144px]' : 'min-h-[226px]'}`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            disabled={disabled}
          />
        </>
      ) : null}
    </article>
  );
}
