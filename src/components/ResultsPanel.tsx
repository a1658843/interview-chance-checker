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
          className="max-w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-sm leading-5 text-slate-700"
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
    <article className={`rounded-lg border border-slate-200 bg-white shadow-sm ${variant === 'chips' ? 'p-4' : 'p-5'}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-cyan-700" />
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      </div>
      {variant === 'chips' ? (
        <TagChips items={items} />
      ) : (
        <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-700" />
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
    <article className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-center gap-2 text-sm font-medium text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-700" />
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
      <section className="rounded-lg border border-amber-300 bg-amber-50 p-8 text-center shadow-sm">
        <TriangleAlert className="mx-auto h-8 w-8 text-amber-700" />
        <h2 className="mt-4 text-xl font-semibold text-slate-950">Possible Input Error</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-700">{inputError}</p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-cyan-700" />
        <h2 className="mt-4 text-xl font-semibold text-slate-950">Results will appear here</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
          Paste one resume and one job description to generate a first-pass analysis.
        </p>
      </section>
    );
  }

  const displayedApplicationRequirements = getDisplayedApplicationRequirements(result.applicationRequirements);

  return (
    <section key={resultVersion} className="results-fade-in space-y-4">
      {analysisWarning ? (
        <article className="rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <p className="text-sm leading-6 text-slate-700">{analysisWarning}</p>
          </div>
        </article>
      ) : null}
      <ListSection
        title="Additional Application Steps Detected"
        icon={CircleAlert}
        items={displayedApplicationRequirements}
      />
      <ScoreCard result={result} />
      <article className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-950">Short Reasoning</h3>
        <p className="mt-2 text-sm leading-6 text-slate-700">{result.reasoning}</p>
      </article>
      <div className="grid gap-4 lg:grid-cols-2">
        {result.strongMatches.length > 0 ? (
          <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-cyan-700" />
              <h3 className="text-base font-semibold text-slate-950">Strong Matches</h3>
            </div>
            <TagChips items={result.strongMatches.slice(0, 5).map((match) => match.label)} />
          </article>
        ) : null}
        <ListSection title="Critical Gaps" icon={TriangleAlert} items={result.criticalGaps} variant="chips" />
      </div>
    </section>
  );
}
