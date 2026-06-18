import type { AnalysisResult } from '../types/analysis';

type ScoreCardProps = {
  result: AnalysisResult;
};

export function ScoreCard({ result }: ScoreCardProps) {
  const cards = [
    {
      label: 'Job Fit Score',
      value: `${result.jobFitScore.toFixed(1)} / 10`,
      tone: 'text-slate-950',
      helper: 'Resume-to-JD fit',
    },
    {
      label: 'Recommendation',
      value: result.recommendation,
      tone: 'text-cyan-700',
      helper: 'Apply decision',
    },
    {
      label: 'Estimated Interview Chance',
      value: result.estimatedInterviewChance,
      tone: 'text-slate-950',
      helper: 'This estimate is separate from fit score and reflects market competition factors.',
    },
    {
      label: 'Market Competition',
      value: result.marketCompetition,
      tone: 'text-slate-950',
      helper: result.competitionFactors.length ? result.competitionFactors.join(' | ') : 'Posting pressure',
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
          <p className={`mt-3 text-2xl font-bold ${card.tone}`}>{card.value}</p>
          <p className="mt-2 text-sm text-slate-500">{card.helper}</p>
        </article>
      ))}
    </section>
  );
}
