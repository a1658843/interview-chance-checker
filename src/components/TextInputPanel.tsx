type TextInputPanelProps = {
  label: string;
  helper: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
};

export function TextInputPanel({ label, helper, placeholder, value, onChange }: TextInputPanelProps) {
  return (
    <label className="flex min-h-[370px] flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <span className="text-sm font-semibold text-slate-950">{label}</span>
      <span className="mt-1 text-sm leading-6 text-slate-600">{helper}</span>
      <textarea
        className="mt-4 min-h-[270px] flex-1 resize-none rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-600 focus:bg-white focus:ring-4 focus:ring-cyan-100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
