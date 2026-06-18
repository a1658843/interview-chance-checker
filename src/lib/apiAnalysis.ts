import { clampScore } from './scoring';
import type { AnalysisResult, MarketCompetition, Recommendation, StrongMatch } from '../types/analysis';

type ApiStrongMatch = {
  label?: unknown;
  evidence?: unknown;
};

type ApiAnalysisResult = {
  jobFitScore?: unknown;
  recommendation?: unknown;
  estimatedInterviewChance?: unknown;
  marketCompetition?: unknown;
  strongMatches?: unknown;
  criticalGaps?: unknown;
  specializedGaps?: unknown;
  missingSkills?: unknown;
  missingSignals?: unknown;
  whyChanceIsNotHigher?: unknown;
  competitionFactors?: unknown;
  recruiterConcerns?: unknown;
  topImprovements?: unknown;
  reasoning?: unknown;
};

const recommendations: Recommendation[] = ['Strong Apply', 'Apply', 'Stretch', 'Skip'];
const marketCompetitionLevels: MarketCompetition[] = ['Low', 'Medium', 'High', 'Very High'];

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function strongMatches(value: unknown): StrongMatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((match): StrongMatch | null => {
      const apiMatch = match as ApiStrongMatch;
      if (typeof apiMatch.label !== 'string') {
        return null;
      }

      const evidence = stringArray(apiMatch.evidence);
      if (evidence.length === 0) {
        return null;
      }

      return {
        label: apiMatch.label,
        evidence,
      };
    })
    .filter((match): match is StrongMatch => Boolean(match));
}

function recommendation(value: unknown): Recommendation {
  return recommendations.includes(value as Recommendation) ? (value as Recommendation) : 'Skip';
}

function marketCompetition(value: unknown): MarketCompetition {
  return marketCompetitionLevels.includes(value as MarketCompetition)
    ? (value as MarketCompetition)
    : 'Medium';
}

function score(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? clampScore(value) : 0;
}

function text(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

export async function analyzeWithApi(
  resumeText: string,
  jobDescriptionText: string,
): Promise<AnalysisResult> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ resumeText, jobDescriptionText }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Analysis API request failed');
  }

  const data = (await response.json()) as ApiAnalysisResult;

  return {
    jobFitScore: score(data.jobFitScore),
    recommendation: recommendation(data.recommendation),
    estimatedInterviewChance: text(data.estimatedInterviewChance, 'Unavailable'),
    marketCompetition: marketCompetition(data.marketCompetition),
    strongMatches: strongMatches(data.strongMatches),
    criticalGaps: stringArray(data.criticalGaps),
    specializedGaps: stringArray(data.specializedGaps),
    missingSkills: stringArray(data.missingSkills),
    missingSignals: stringArray(data.missingSignals),
    chanceReasons: stringArray(data.whyChanceIsNotHigher),
    competitionFactors: stringArray(data.competitionFactors),
    recruiterConcerns: stringArray(data.recruiterConcerns),
    resumeImprovements: stringArray(data.topImprovements),
    reasoning: text(data.reasoning, 'The analysis completed, but no reasoning was returned.'),
  };
}
