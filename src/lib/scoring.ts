import type { CompanyType, EffortLevel, OpportunityQuality, Recommendation } from '../types/analysis';

type RecommendationContext = {
  applicationRequirements?: string[];
  companyType?: CompanyType;
  effortLevel?: EffortLevel;
  interviewChance?: string;
  opportunityQuality?: OpportunityQuality;
};

function getInterviewChanceUpperBound(interviewChance?: string) {
  if (!interviewChance) {
    return null;
  }

  const matches = [...interviewChance.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  if (matches.length === 0) {
    return interviewChance.includes('<') ? 1 : null;
  }

  return Math.max(...matches);
}

export function getRecommendation(score: number, context: RecommendationContext = {}): Recommendation {
  const effortLevel = context.effortLevel ?? 'Low';
  const applicationRequirements = context.applicationRequirements ?? [];
  const opportunityQuality = context.opportunityQuality ?? 'Medium';
  const interviewChanceUpperBound = getInterviewChanceUpperBound(context.interviewChance);
  const lowInterviewChance = interviewChanceUpperBound !== null && interviewChanceUpperBound <= 5;
  const veryLowInterviewChance = interviewChanceUpperBound !== null && interviewChanceUpperBound <= 2;
  const veryHighEffort =
    effortLevel === 'Very High' ||
    (applicationRequirements.includes('Coding Challenge Required') &&
      applicationRequirements.includes('Video Submission Required')) ||
    applicationRequirements.includes('Multi-hour Assessment Required');
  const highEffort = effortLevel === 'High' || veryHighEffort;
  const strongOpportunity = opportunityQuality === 'High';
  const weakerOpportunity = opportunityQuality === 'Low';

  if (score >= 8) {
    if (veryHighEffort && lowInterviewChance) {
      return score >= 8.5 ? 'Apply ✅' : 'Borderline ⚠️';
    }

    if (weakerOpportunity) {
      return 'Apply ✅';
    }

    if (strongOpportunity) {
      return 'Strong Apply ✅';
    }

    return 'Apply ✅';
  }

  if (score >= 7) {
    if ((highEffort && lowInterviewChance) || weakerOpportunity) {
      return 'Borderline ⚠️';
    }

    return 'Apply ✅';
  }

  if (score >= 6) {
    if ((effortLevel === 'Low' || effortLevel === 'Medium') && !veryLowInterviewChance) {
      return 'Apply ✅';
    }

    return 'Borderline ⚠️';
  }

  if (score >= 4) {
    return 'Skip ❌';
  }

  return 'Hard Skip ❌❌';
}

export function clampScore(score: number) {
  return Math.max(0, Math.min(10, Number(score.toFixed(1))));
}
