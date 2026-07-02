import { CheckCircle2, ChevronDown, CircleAlert, Loader2, type LucideIcon, Sparkles, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AnalysisInputValidationDebug } from '../lib/validation';
import type { AnalysisResult } from '../types/analysis';
import { ScoreCard } from './ScoreCard';

type ResultsPanelProps = {
  result: AnalysisResult | null;
  inputError: string | null;
  analysisWarning?: string | null;
  isAnalyzing?: boolean;
  resultVersion?: number;
  scoreContextActions?: ReactNode;
  validationDebug?: AnalysisInputValidationDebug | null;
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

function shouldExpandMatchDetails(recommendation: string) {
  return recommendation.startsWith('Strong Apply') || recommendation.startsWith('Apply');
}

function getMatchDetailsSummary(result: AnalysisResult) {
  const parts = [];
  const strengthCount = result.strongMatches.length;
  const gapCount = result.criticalGaps.length;

  if (strengthCount > 0) {
    parts.push(`${strengthCount} ${strengthCount === 1 ? 'strength' : 'strengths'}`);
  }

  if (gapCount > 0) {
    parts.push(`${gapCount} critical ${gapCount === 1 ? 'gap' : 'gaps'}`);
  }

  return parts.length > 0 ? `Match Details · ${parts.join(' · ')}` : 'Match Details';
}

function MatchDetails({ result, resultVersion }: { result: AnalysisResult; resultVersion: number }) {
  const [isExpanded, setIsExpanded] = useState(() => shouldExpandMatchDetails(result.recommendation));
  const strongMatchLabels = result.strongMatches.slice(0, 5).map((match) => match.label);
  const hasStrongMatches = strongMatchLabels.length > 0;
  const hasCriticalGaps = result.criticalGaps.length > 0;
  const hasDetails = hasStrongMatches || hasCriticalGaps;
  const contentId = `match-details-${resultVersion}`;

  useEffect(() => {
    setIsExpanded(shouldExpandMatchDetails(result.recommendation));
  }, [result.recommendation, resultVersion]);

  return (
    <article className="rounded-lg border border-slate-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 rounded-lg px-5 py-4 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-zinc-700/40 dark:focus:ring-cyan-400 dark:focus:ring-offset-zinc-800 dark:disabled:hover:bg-transparent"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        disabled={!hasDetails}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="text-sm font-semibold text-slate-800 dark:text-zinc-100">{getMatchDetailsSummary(result)}</span>
        {hasDetails ? (
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-slate-500 transition-transform dark:text-zinc-400 ${
              isExpanded ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        ) : null}
      </button>

      {hasDetails && isExpanded ? (
        <div id={contentId} className="border-t border-slate-200 px-5 py-4 dark:border-zinc-700">
          <div className={`grid gap-4 ${hasStrongMatches && hasCriticalGaps ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
            {hasStrongMatches ? (
              <section>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-cyan-700 dark:text-cyan-400" />
                  <h3 className="text-base font-semibold text-slate-950 dark:text-zinc-50">Strong Matches</h3>
                </div>
                <TagChips items={strongMatchLabels} />
              </section>
            ) : null}

            {hasCriticalGaps ? (
              <section>
                <div className="flex items-center gap-2">
                  <TriangleAlert className="h-5 w-5 text-rose-700 dark:text-rose-400" />
                  <h3 className="text-base font-semibold text-slate-950 dark:text-zinc-50">Critical Gaps</h3>
                </div>
                <TagChips items={result.criticalGaps} />
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
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

function DebugList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <dt className="font-semibold text-slate-800 dark:text-zinc-100">{label}</dt>
      <dd className="mt-1 break-words text-slate-600 dark:text-zinc-300">
        {values.length > 0 ? values.join(', ') : 'none'}
      </dd>
    </div>
  );
}

function ValidationDebugPanel({ debug }: { debug: AnalysisInputValidationDebug }) {
  const jobDebug = debug.jobDescriptionValidationDebug;

  return (
    <details className="mx-auto mt-4 max-w-3xl rounded-md border border-amber-300 bg-white/70 text-left shadow-sm dark:border-amber-500/40 dark:bg-zinc-900/60">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 dark:text-zinc-100">
        Validation debug (development only)
      </summary>
      <dl className="grid gap-3 border-t border-amber-200 px-4 py-3 text-xs leading-5 dark:border-amber-500/30 sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-slate-800 dark:text-zinc-100">Input source</dt>
          <dd className="mt-1 text-slate-600 dark:text-zinc-300">{jobDebug.inputSource}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-800 dark:text-zinc-100">Triggered rule</dt>
          <dd className="mt-1 text-slate-600 dark:text-zinc-300">{jobDebug.triggeredRule ?? 'none'}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-800 dark:text-zinc-100">Resume length</dt>
          <dd className="mt-1 text-slate-600 dark:text-zinc-300">{jobDebug.resumeLength}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-800 dark:text-zinc-100">Job description length</dt>
          <dd className="mt-1 text-slate-600 dark:text-zinc-300">{jobDebug.normalizedLength}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-800 dark:text-zinc-100">LinkedIn job payload detected</dt>
          <dd className="mt-1 text-slate-600 dark:text-zinc-300">{String(jobDebug.isLinkedInJobPayload)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-800 dark:text-zinc-100">Phone-like URL ignored</dt>
          <dd className="mt-1 text-slate-600 dark:text-zinc-300">{String(jobDebug.phoneLikeUrlIgnored)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-800 dark:text-zinc-100">Contains LinkedIn jobs URL</dt>
          <dd className="mt-1 text-slate-600 dark:text-zinc-300">{String(jobDebug.containsLinkedInJobsUrl)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-800 dark:text-zinc-100">Contains LinkedIn profile URL</dt>
          <dd className="mt-1 text-slate-600 dark:text-zinc-300">{String(jobDebug.containsLinkedInProfileUrl)}</dd>
        </div>
        <DebugList label="Resume signals" values={debug.resume.detectedResumeSignals} />
        <DebugList label="Job description signals" values={jobDebug.detectedResumeSignals} />
        <DebugList label="Job signals" values={jobDebug.detectedJobSignals} />
      </dl>
    </details>
  );
}

export function ResultsPanel({
  result,
  inputError,
  analysisWarning,
  isAnalyzing = false,
  resultVersion = 0,
  scoreContextActions,
  validationDebug,
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
        {validationDebug ? <ValidationDebugPanel debug={validationDebug} /> : null}
      </section>
    );
  }

  if (!result) {
    return (
      <section className="rounded-lg border border-dashed border-slate-400 bg-white p-8 text-center dark:border-zinc-600 dark:bg-zinc-800">
        <Sparkles className="mx-auto h-8 w-8 text-cyan-700 dark:text-cyan-400" />
        <h2 className="mt-4 text-xl font-semibold text-slate-950 dark:text-zinc-50">Results will appear here</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-zinc-300">
          Add a resume and paste a job description to generate a first-pass analysis.
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
      <ScoreCard result={result} contextActions={scoreContextActions} />
      <article className="rounded-lg border border-slate-300 bg-white px-5 py-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <h3 className="text-base font-semibold text-slate-950 dark:text-zinc-50">Short Reasoning</h3>
        <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-zinc-300">{result.reasoning}</p>
      </article>
      <MatchDetails result={result} resultVersion={resultVersion} />
    </section>
  );
}
