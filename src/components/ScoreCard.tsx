import { CircleCheck, CircleX, Info } from 'lucide-react';
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
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-500 outline-none transition-colors duration-150 ease-out hover:text-cyan-700 focus-visible:text-cyan-700 focus-visible:ring-2 focus-visible:ring-cyan-200 motion-reduce:transition-none dark:text-zinc-400 dark:hover:text-cyan-400 dark:focus-visible:text-cyan-400 dark:focus-visible:ring-cyan-900"
      >
        <Info className="h-4 w-4" />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-6 z-10 hidden w-64 -translate-x-1/2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-xs font-normal normal-case leading-5 tracking-normal text-slate-600 shadow-lg group-hover:block group-focus-within:block dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
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
          ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-400/10 dark:text-amber-200'
          : 'border-slate-300 bg-slate-50 text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
      }`}
    >
      {children}
    </span>
  );
}

function getRecommendationTone(recommendation: AnalysisResult['recommendation']) {
  if (recommendation.startsWith('Strong Apply')) {
    return 'text-emerald-700 dark:text-emerald-300';
  }

  if (recommendation.startsWith('Apply')) {
    return 'text-cyan-700 dark:text-cyan-400';
  }

  if (recommendation.startsWith('Hard Skip')) {
    return 'text-red-800 dark:text-red-300';
  }

  return 'text-rose-700 dark:text-rose-300';
}

function getRecommendationAccent(recommendation: AnalysisResult['recommendation']) {
  if (recommendation.startsWith('Strong Apply')) {
    return 'border-emerald-200 ring-emerald-100 dark:border-emerald-500/40 dark:ring-emerald-400/10';
  }

  if (recommendation.startsWith('Apply')) {
    return 'border-cyan-200 ring-cyan-100 dark:border-cyan-500/30 dark:ring-cyan-400/10';
  }

  if (recommendation.startsWith('Hard Skip')) {
    return 'border-red-300 ring-red-100 dark:border-red-500/55 dark:ring-red-400/15';
  }

  return 'border-rose-200 ring-rose-100 dark:border-rose-500/35 dark:ring-rose-400/10';
}

function getRecommendationLabel(recommendation: AnalysisResult['recommendation']) {
  if (recommendation.startsWith('Strong Apply')) {
    return 'Strong Apply';
  }

  if (recommendation.startsWith('Apply')) {
    return 'Apply';
  }

  if (recommendation.startsWith('Hard Skip')) {
    return 'Hard Skip';
  }

  return 'Skip';
}

function RecommendationDisplay({ recommendation }: { recommendation: AnalysisResult['recommendation'] }) {
  const Icon = recommendation.startsWith('Strong Apply') || recommendation.startsWith('Apply') ? CircleCheck : CircleX;

  return (
    <span className="inline-flex items-center justify-center gap-2">
      <Icon className="h-8 w-8 shrink-0 stroke-[2.25]" />
      <span>{getRecommendationLabel(recommendation)}</span>
    </span>
  );
}

export function ScoreCard({ result }: ScoreCardProps) {
  const primaryCards = [
    {
      label: 'Recommendation',
      value: <RecommendationDisplay recommendation={result.recommendation} />,
      tone: getRecommendationTone(result.recommendation),
      accent: getRecommendationAccent(result.recommendation),
      isPrimary: true,
    },
    {
      label: 'Job Fit Score',
      value: `${result.jobFitScore.toFixed(1)} / 10`,
      tone: 'text-slate-950 dark:text-zinc-50',
      tooltip:
        'Measures how closely your resume matches the technical, experience, and role requirements in the job posting. It does not include market competition or hiring-channel effects.',
      isPrimary: false,
    },
    {
      label: 'Estimated Interview Chance',
      value: result.estimatedInterviewChance,
      tone: 'text-slate-950 dark:text-zinc-50',
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
            className={`rounded-lg border bg-white shadow-sm dark:bg-zinc-800 ${
              card.isPrimary
                ? `flex min-h-32 flex-col p-5 ring-1 ${card.accent}`
                : 'flex min-h-32 flex-col border-slate-300 p-4 dark:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">{card.label}</p>
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
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        {result.employmentType ? (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-zinc-200">Employment Type</span>
            <MetadataBadge>{result.employmentType}</MetadataBadge>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-zinc-200">
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
