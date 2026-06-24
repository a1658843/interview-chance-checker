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
    case 'Skip ❌':
      return 'Low expected return on application time.';
    case 'Hard Skip ❌❌':
      return 'Major mismatch. Do not spend time applying.';
  }
}

export function ScoreCard({ result }: ScoreCardProps) {
  const decisionCards = [
    ...(result.employmentType
      ? [
          {
            label: 'Employment Type',
            value: result.employmentType,
            tone: 'text-slate-950',
            helper: 'Role structure',
          },
        ]
      : []),
    {
      label: 'Employer Type',
      value: result.companyType,
      tone: result.companyType === 'Suspicious Posting' ? 'text-amber-700' : 'text-slate-950',
      helper: 'Posting quality source',
    },
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
      <div className={`grid gap-3 ${result.employmentType ? 'md:grid-cols-2 xl:grid-cols-5' : 'md:grid-cols-2 lg:grid-cols-4'}`}>
        {decisionCards.map((card) => (
          <article key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className={`mt-3 text-xl font-bold leading-tight xl:text-2xl ${card.tone}`}>{card.value}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500 xl:text-sm">{card.helper}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
