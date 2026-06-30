import { CheckCircle2, CircleAlert, Loader2, type LucideIcon, Sparkles, TriangleAlert } from 'lucide-react';
import type { AnalysisResult } from '../types/analysis';
import { ScoreCard } from './ScoreCard';

type ResultsPanelProps = {
  result: AnalysisResult | null;
  inputError: string | null;
  analysisWarning?: string | null;
  isAnalyzing?: boolean;
  resultVersion?: number;
};

type ListSectionProps = {
  title: string;
  icon: LucideIcon;
  items: string[];
  variant?: 'list' | 'chips';
};

function TagChips({ items }: { items: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="max-w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-1 text-sm leading-5 text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function ListSection({ title, icon: Icon, items, variant = 'list' }: ListSectionProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <article className={`rounded-lg border border-slate-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800 ${variant === 'chips' ? 'p-4' : 'p-5'}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-cyan-700 dark:text-cyan-400" />
        <h3 className="text-base font-semibold text-slate-950 dark:text-zinc-50">{title}</h3>
      </div>
      {variant === 'chips' ? (
        <TagChips items={items} />
      ) : (
        <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700 dark:text-zinc-300">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-700 dark:bg-cyan-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function getDisplayedApplicationRequirements(requirements: string[]) {
  const priority = [
    'AI Interview Required',
    'Coding Challenge Required',
    'Video Submission Required',
    'Take-Home Project Required',
    'Portfolio Submission Required',
    'Extra Platform Registration Required',
  ];
  const requirementSet = new Set(
    requirements.map((requirement) =>
      requirement === 'Take-home Project Required'
        ? 'Take-Home Project Required'
        : requirement === 'Portfolio Required'
          ? 'Portfolio Submission Required'
          : requirement,
    ),
  );

  return priority.filter((requirement) => requirementSet.has(requirement)).slice(0, 3);
}

function LoadingIndicator() {
  return (
    <article className="rounded-lg border border-slate-300 bg-white px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
      <div className="flex items-center justify-center gap-2 text-sm font-medium text-slate-600 dark:text-zinc-300">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-700 dark:text-cyan-400" />
        <span>Analyzing your resume and job description...</span>
      </div>
    </article>
  );
}

export function ResultsPanel({
  result,
  inputError,
  analysisWarning,
  isAnalyzing = false,
  resultVersion = 0,
}: ResultsPanelProps) {
  if (isAnalyzing) {
    return <LoadingIndicator />;
  }

  if (inputError) {
    return (
      <section className="rounded-lg border border-amber-300 bg-amber-50 p-8 text-center shadow-sm dark:border-amber-500/40 dark:bg-amber-400/10">
        <TriangleAlert className="mx-auto h-8 w-8 text-amber-700 dark:text-amber-300" />
        <h2 className="mt-4 text-xl font-semibold text-slate-950 dark:text-zinc-50">Possible Input Error</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-700 dark:text-zinc-300">{inputError}</p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="rounded-lg border border-dashed border-slate-400 bg-white p-8 text-center dark:border-zinc-600 dark:bg-zinc-800">
        <Sparkles className="mx-auto h-8 w-8 text-cyan-700 dark:text-cyan-400" />
        <h2 className="mt-4 text-xl font-semibold text-slate-950 dark:text-zinc-50">Results will appear here</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-zinc-300">
          Paste one resume and one job description to generate a first-pass analysis.
        </p>
      </section>
    );
  }

  const displayedApplicationRequirements = getDisplayedApplicationRequirements(result.applicationRequirements);

  return (
    <section key={resultVersion} className="results-fade-in space-y-4">
      {analysisWarning ? (
        <article className="rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm dark:border-amber-500/40 dark:bg-amber-400/10">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
            <p className="text-sm leading-6 text-slate-700 dark:text-zinc-300">{analysisWarning}</p>
          </div>
        </article>
      ) : null}
      <ListSection
        title="Additional Application Steps Detected"
        icon={CircleAlert}
        items={displayedApplicationRequirements}
      />
      <ScoreCard result={result} />
      <article className="rounded-lg border border-slate-300 bg-white px-5 py-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <h3 className="text-base font-semibold text-slate-950 dark:text-zinc-50">Short Reasoning</h3>
        <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-zinc-300">{result.reasoning}</p>
      </article>
      <div className="grid gap-4 lg:grid-cols-2">
        {result.strongMatches.length > 0 ? (
          <article className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-cyan-700 dark:text-cyan-400" />
              <h3 className="text-base font-semibold text-slate-950 dark:text-zinc-50">Strong Matches</h3>
            </div>
            <TagChips items={result.strongMatches.slice(0, 5).map((match) => match.label)} />
          </article>
        ) : null}
        <ListSection title="Critical Gaps" icon={TriangleAlert} items={result.criticalGaps} variant="chips" />
      </div>
    </section>
  );
}
