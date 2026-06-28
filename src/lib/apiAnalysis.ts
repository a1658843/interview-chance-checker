import { clampScore, getRecommendation } from './scoring';
import { extractEmploymentType } from './employmentType';
import type {
  AnalysisResult,
  CompanyType,
  EffortLevel,
  EmploymentType,
  MarketCompetition,
  OpportunityQuality,
  Recommendation,
  StrongMatch,
} from '../types/analysis';

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
  employmentType?: unknown;
  companyType?: unknown;
  opportunityQuality?: unknown;
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
const companyTypes: CompanyType[] = [
  'Direct Employer',
  'Staffing Agency',
  'Talent Network',
  'Suspicious Posting',
  'Consulting',
  'Startup',
  'Unknown',
];
const opportunityQualities: OpportunityQuality[] = ['High', 'Medium', 'Low'];
const recommendations: Recommendation[] = ['Strong Apply ✅', 'Apply ✅', 'Skip ❌', 'Hard Skip ❌❌'];
const effortLevelValues: EffortLevel[] = ['Low', 'Medium', 'High', 'Very High'];
const employmentTypeValues: EmploymentType[] = [
  'Full-Time',
  'Part-Time',
  'Contract',
  'Part-Time Contract',
  'Full-Time Contract',
  'Contract-to-Hire',
  'Internship',
];
const allowedApplicationRequirements = new Set([
  'AI Interview Required',
  'Coding Challenge Required',
  'Video Submission Required',
  'Take-Home Project Required',
  'Portfolio Submission Required',
  'Multi-hour Assessment Required',
  'Work Sample Required',
  'Extra Platform Registration Required',
  'Onsite Interview Required',
]);
const applicationRequirementAliases = new Map([
  ['Take-home Project Required', 'Take-Home Project Required'],
  ['Portfolio Required', 'Portfolio Submission Required'],
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
  return stringArray(value)
    .map((item) => applicationRequirementAliases.get(item) ?? item)
    .filter((item) => allowedApplicationRequirements.has(item));
}

function effortLevel(value: unknown, requirements: string[]): EffortLevel {
  if (effortLevelValues.includes(value as EffortLevel)) {
    return value as EffortLevel;
  }

  const majorSteps = requirements.filter((requirement) =>
    [
      'Coding Challenge Required',
      'Take-Home Project Required',
      'Multi-hour Assessment Required',
      'Video Submission Required',
      'Work Sample Required',
    ].includes(requirement),
  );

  if (
    requirements.includes('Multi-hour Assessment Required') ||
    requirements.includes('AI Interview Required') ||
    (requirements.includes('Coding Challenge Required') && requirements.includes('Video Submission Required')) ||
    majorSteps.length >= 2
  ) {
    return 'Very High';
  }

  if (
    requirements.includes('Coding Challenge Required') ||
    requirements.includes('Take-Home Project Required')
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

function companyType(value: unknown): CompanyType {
  return companyTypes.includes(value as CompanyType) ? (value as CompanyType) : 'Unknown';
}

function opportunityQuality(value: unknown): OpportunityQuality {
  return opportunityQualities.includes(value as OpportunityQuality) ? (value as OpportunityQuality) : 'Medium';
}

function recommendation(value: unknown): Recommendation | null {
  return recommendations.includes(value as Recommendation) ? (value as Recommendation) : null;
}

function mapEmploymentType(value: unknown): EmploymentType | undefined {
  return employmentTypeValues.includes(value as EmploymentType) ? (value as EmploymentType) : undefined;
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
  const mappedCompanyType = companyType(data.companyType);
  const mappedOpportunityQuality = opportunityQuality(data.opportunityQuality);
  const mappedInterviewChance = text(data.interviewChance ?? data.estimatedInterviewChance, 'Unavailable');
  const mappedStrongMatches = strongMatches(data.strongMatches);
  const mappedCriticalGaps = stringArray(data.criticalGaps);
  const mappedReasoning = text(
    data.shortReasoning ?? data.reasoning,
    'The analysis completed, but no reasoning was returned.',
  );
  const mappedRecommendation =
    recommendation(data.recommendation) ??
    getRecommendation(mappedScore, {
      applicationRequirements: mappedApplicationRequirements,
      companyType: mappedCompanyType,
      effortLevel: mappedEffortLevel,
      interviewChance: mappedInterviewChance,
      opportunityQuality: mappedOpportunityQuality,
      reasoning: [mappedReasoning, ...mappedCriticalGaps].join(' '),
      strongMatchCount: mappedStrongMatches.length,
    });

  return {
    jobFitScore: mappedScore,
    recommendation: mappedRecommendation,
    estimatedInterviewChance: mappedInterviewChance,
    marketCompetition: marketCompetition(data.marketCompetition),
    jobLogistics: text(data.jobLogistics, 'Not specified'),
    employmentType: mapEmploymentType(data.employmentType) ?? extractEmploymentType(jobDescriptionText) ?? undefined,
    companyType: mappedCompanyType,
    opportunityQuality: mappedOpportunityQuality,
    strongMatches: mappedStrongMatches,
    applicationRequirements: mappedApplicationRequirements,
    effortLevel: mappedEffortLevel,
    criticalGaps: mappedCriticalGaps,
    specializedGaps: stringArray(data.specializedGaps),
    missingSkills: stringArray(data.missingSkills),
    missingSignals: stringArray(data.missingSignals),
    chanceReasons: stringArray(data.whyChanceIsNotHigher),
    competitionFactors: stringArray(data.competitionFactors),
    resumeImprovements: stringArray(data.topImprovements),
    reasoning: mappedReasoning,
  };
}
