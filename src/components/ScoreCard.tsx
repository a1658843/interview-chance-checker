import { Info } from 'lucide-react';
import type { AnalysisResult } from '../types/analysis';

type ScoreCardProps = {
  result: AnalysisResult;
};

type InfoTooltipProps = {
  label: string;
  text: string;
};

function InfoTooltip({ label, text }: InfoTooltipProps) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 outline-none transition hover:text-cyan-700 focus-visible:text-cyan-700 focus-visible:ring-2 focus-visible:ring-cyan-200"
      >
        <Info className="h-4 w-4" />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-6 z-10 hidden w-64 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-xs font-normal normal-case leading-5 tracking-normal text-slate-600 shadow-lg group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  );
}

function MetadataBadge({ children, warning = false }: { children: string; warning?: boolean }) {
  return (
    <span
      className={`inline-flex h-7 items-center rounded-full border px-3 text-sm font-medium ${
        warning
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-slate-200 bg-slate-50 text-slate-700'
      }`}
    >
      {children}
    </span>
  );
}

export function ScoreCard({ result }: ScoreCardProps) {
  const primaryCards = [
    {
      label: 'Recommendation',
      value: result.recommendation,
      tone: 'text-cyan-700',
      isPrimary: true,
    },
    {
      label: 'Job Fit Score',
      value: `${result.jobFitScore.toFixed(1)} / 10`,
      tone: 'text-slate-950',
      tooltip:
        'Measures how closely your resume matches the technical, experience, and role requirements in the job posting. It does not include market competition or hiring-channel effects.',
      isPrimary: false,
    },
    {
      label: 'Estimated Interview Chance',
      value: result.estimatedInterviewChance,
      tone: 'text-slate-950',
      tooltip:
        'Estimated likelihood of receiving an interview invitation based on resume fit, experience level, market competition, employer type, and opportunity quality. This is separate from Job Fit Score.',
      isPrimary: false,
    },
  ];

  return (
    <section className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-3">
        {primaryCards.map((card) => (
          <article
            key={card.label}
            className={`rounded-lg border bg-white shadow-sm ${
              card.isPrimary
                ? 'flex min-h-32 flex-col border-cyan-200 p-5 ring-1 ring-cyan-100'
                : 'flex min-h-32 flex-col border-slate-200 p-4'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
              {'tooltip' in card && card.tooltip ? (
                <InfoTooltip label={`${card.label} information`} text={card.tooltip} />
              ) : null}
            </div>
            <p
              className={`flex flex-1 items-center justify-center text-center font-semibold leading-tight ${card.isPrimary ? 'text-4xl xl:text-[2.75rem]' : 'text-3xl xl:text-4xl'} ${card.tone}`}
            >
              {card.value}
            </p>
          </article>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
        {result.employmentType ? (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Employment Type</span>
            <MetadataBadge>{result.employmentType}</MetadataBadge>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
            Employer Type
            <InfoTooltip
              label="Employer Type information"
              text="Identifies whether the posting comes from a direct employer, staffing agency, recruiting firm, talent marketplace, or similar hiring channel. This can affect expected interview conversion."
            />
          </span>
          <MetadataBadge warning={result.companyType === 'Suspicious Posting'}>{result.companyType}</MetadataBadge>
        </div>
      </div>
    </section>
  );
}
