import { CheckCircle2, CircleAlert, ListChecks, Search, Sparkles, TriangleAlert } from 'lucide-react';
import type { AnalysisResult } from '../types/analysis';
import { ScoreCard } from './ScoreCard';

type ResultsPanelProps = {
  result: AnalysisResult | null;
  inputError: string | null;
  analysisWarning?: string | null;
};

type ListSectionProps = {
  title: string;
  icon: typeof Search;
  items: string[];
};

function ListSection({ title, icon: Icon, items }: ListSectionProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-cyan-700" />
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      </div>
      <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-700" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function ResultsPanel({ result, inputError, analysisWarning }: ResultsPanelProps) {
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

  return (
    <section className="space-y-4">
      {analysisWarning ? (
        <article className="rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <p className="text-sm leading-6 text-slate-700">{analysisWarning}</p>
          </div>
        </article>
      ) : null}
      <ScoreCard result={result} />
      <div className="grid gap-4 lg:grid-cols-2">
        {result.strongMatches.length > 0 ? (
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-cyan-700" />
              <h3 className="text-base font-semibold text-slate-950">Strong Matches</h3>
            </div>
            <div className="mt-4 space-y-5">
              {result.strongMatches.map((match) => (
                <div key={match.label}>
                  <p className="text-sm font-semibold text-slate-800">{match.label}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</p>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                    {match.evidence.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-700" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </article>
        ) : null}
        <ListSection title="Special Flags" icon={TriangleAlert} items={result.specialFlags} />
        <ListSection title="Critical Gaps" icon={TriangleAlert} items={result.criticalGaps} />
        <ListSection title="Specialized Gaps" icon={TriangleAlert} items={result.specializedGaps} />
        <ListSection title="Missing Skills" icon={Search} items={result.missingSkills} />
        <ListSection title="Missing Signals" icon={TriangleAlert} items={result.missingSignals} />
        <ListSection title="Why Interview Chance Is Not Higher" icon={CircleAlert} items={result.chanceReasons} />
        <ListSection title="Competition Factors" icon={CheckCircle2} items={result.competitionFactors} />
        <ListSection title="Recruiter Concerns" icon={CircleAlert} items={result.recruiterConcerns} />
        <ListSection title="Top 3 Resume Improvements" icon={ListChecks} items={result.resumeImprovements} />
      </div>
      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-950">Short Reasoning</h3>
        <p className="mt-3 text-sm leading-6 text-slate-700">{result.reasoning}</p>
      </article>
    </section>
  );
}
