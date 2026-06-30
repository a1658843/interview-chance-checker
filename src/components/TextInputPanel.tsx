type TextInputPanelProps = {
  label: string;
  helper: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
};

export function TextInputPanel({ label, helper, placeholder, value, onChange }: TextInputPanelProps) {
  return (
    <label className="flex min-h-[326px] flex-col rounded-lg border border-slate-300 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
      <span className="text-sm font-semibold text-slate-950 dark:text-zinc-50">{label}</span>
      <span className="mt-1 text-sm leading-6 text-slate-600 dark:text-zinc-300">{helper}</span>
      <textarea
        className="mt-4 min-h-[226px] flex-1 resize-none rounded-md border border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-900 outline-none transition-colors duration-150 ease-out placeholder:text-slate-500 focus:border-cyan-600 focus:bg-white focus:ring-4 focus:ring-cyan-100 motion-reduce:transition-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-cyan-500 dark:focus:bg-zinc-900 dark:focus:ring-cyan-950"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
