import type { AnalysisResult } from '../types/analysis';

type ScoreCardProps = {
  result: AnalysisResult;
};

function getRecommendationHelper(recommendation: AnalysisResult['recommendation']) {
  switch (recommendation) {
    case 'Strong Apply ✅':
      return 'Excellent fit. Worth extra application effort.';
    case 'Apply ✅':
      return 'Good fit. Apply normally.';
    case 'Borderline ⚠️':
      return 'Apply only if especially interested.';
    case 'Skip ❌':
      return 'Low expected return on application time.';
    case 'Hard Skip ❌❌':
      return 'Major mismatch. Do not spend time applying.';
  }
}

export function ScoreCard({ result }: ScoreCardProps) {
  const decisionCards = [
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
      helper: getRecommendationHelper(result.recommendation),
    },
    {
      label: 'Estimated Interview Chance',
      value: result.estimatedInterviewChance,
      tone: 'text-slate-950',
      helper: 'This estimate is separate from fit score and reflects market competition factors.',
    },
  ];

  return (
    <section className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        {decisionCards.map((card) => (
        <article key={card.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
          <p className={`mt-3 text-2xl font-bold ${card.tone}`}>{card.value}</p>
          <p className="mt-2 text-sm text-slate-500">{card.helper}</p>
        </article>
        ))}
      </div>
    </section>
  );
}
