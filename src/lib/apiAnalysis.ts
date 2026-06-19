import { clampScore, getRecommendation } from './scoring';
import type { AnalysisResult, EffortLevel, MarketCompetition, StrongMatch } from '../types/analysis';

type ApiStrongMatch = {
  label?: unknown;
};

type ApiAnalysisResult = {
  fitScore?: unknown;
  jobFitScore?: unknown;
  recommendation?: unknown;
  interviewChance?: unknown;
  estimatedInterviewChance?: unknown;
  marketCompetition?: unknown;
  jobLogistics?: unknown;
  strongMatches?: unknown;
  applicationRequirements?: unknown;
  effortLevel?: unknown;
  criticalGaps?: unknown;
  specializedGaps?: unknown;
  missingSkills?: unknown;
  missingSignals?: unknown;
  whyChanceIsNotHigher?: unknown;
  competitionFactors?: unknown;
  topImprovements?: unknown;
  shortReasoning?: unknown;
  reasoning?: unknown;
};

const marketCompetitionLevels: MarketCompetition[] = ['Low', 'Medium', 'High', 'Very High'];
const effortLevelValues: EffortLevel[] = ['Low', 'Medium', 'High', 'Very High'];
const allowedApplicationRequirements = new Set([
  'Coding Challenge Required',
  'Take-home Project Required',
  'Video Submission Required',
  'Portfolio Required',
  'Multi-hour Assessment Required',
  'Work Sample Required',
  'Extra Platform Registration Required',
  'Onsite Interview Required',
]);

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
      if (typeof match === 'string' && match.trim().length > 0) {
        return { label: match.trim() };
      }

      const apiMatch = match as ApiStrongMatch;
      if (typeof apiMatch.label !== 'string') {
        return null;
      }

      return {
        label: apiMatch.label.trim(),
      };
    })
    .filter((match): match is StrongMatch => Boolean(match))
    .slice(0, 5);
}

function applicationRequirements(value: unknown) {
  return stringArray(value).filter((item) => allowedApplicationRequirements.has(item));
}

function effortLevel(value: unknown, requirements: string[]): EffortLevel {
  if (effortLevelValues.includes(value as EffortLevel)) {
    return value as EffortLevel;
  }

  const majorSteps = requirements.filter((requirement) =>
    [
      'Coding Challenge Required',
      'Take-home Project Required',
      'Multi-hour Assessment Required',
      'Video Submission Required',
      'Work Sample Required',
    ].includes(requirement),
  );

  if (
    requirements.includes('Multi-hour Assessment Required') ||
    (requirements.includes('Coding Challenge Required') && requirements.includes('Video Submission Required')) ||
    majorSteps.length >= 2
  ) {
    return 'Very High';
  }

  if (
    requirements.includes('Coding Challenge Required') ||
    requirements.includes('Take-home Project Required')
  ) {
    return 'High';
  }

  if (requirements.length > 0) {
    return 'Medium';
  }

  return 'Low';
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
  const apiScore = data.fitScore ?? data.jobFitScore;

  if (typeof apiScore !== 'number') {
    throw new Error('Analysis API returned a test response instead of an analysis result');
  }

  const mappedApplicationRequirements = applicationRequirements(data.applicationRequirements);
  const mappedEffortLevel = effortLevel(data.effortLevel, mappedApplicationRequirements);
  const mappedScore = score(apiScore);

  return {
    jobFitScore: mappedScore,
    recommendation: getRecommendation(mappedScore, mappedEffortLevel),
    estimatedInterviewChance: text(data.interviewChance ?? data.estimatedInterviewChance, 'Unavailable'),
    marketCompetition: marketCompetition(data.marketCompetition),
    jobLogistics: text(data.jobLogistics, 'Not specified'),
    strongMatches: strongMatches(data.strongMatches),
    applicationRequirements: mappedApplicationRequirements,
    effortLevel: mappedEffortLevel,
    criticalGaps: stringArray(data.criticalGaps),
    specializedGaps: stringArray(data.specializedGaps),
    missingSkills: stringArray(data.missingSkills),
    missingSignals: stringArray(data.missingSignals),
    chanceReasons: stringArray(data.whyChanceIsNotHigher),
    competitionFactors: stringArray(data.competitionFactors),
    resumeImprovements: stringArray(data.topImprovements),
    reasoning: text(
      data.shortReasoning ?? data.reasoning,
      'The analysis completed, but no reasoning was returned.',
    ),
  };
}
