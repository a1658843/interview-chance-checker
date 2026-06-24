import type { CompanyType, EffortLevel, OpportunityQuality, Recommendation } from '../types/analysis';

type RecommendationContext = {
  applicationRequirements?: string[];
  companyType?: CompanyType;
  effortLevel?: EffortLevel;
  hasExtremeMismatch?: boolean;
  interviewChance?: string;
  opportunityQuality?: OpportunityQuality;
  reasoning?: string;
  strongMatchCount?: number;
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

function downgradeRecommendation(recommendation: Recommendation): Recommendation {
  if (recommendation === 'Strong Apply ✅') return 'Apply ✅';
  return recommendation;
}

export function getRecommendation(score: number, context: RecommendationContext = {}): Recommendation {
  const effortLevel = context.effortLevel ?? 'Low';
  const applicationRequirements = context.applicationRequirements ?? [];
  const opportunityQuality = context.opportunityQuality ?? 'Medium';
  const interviewChanceUpperBound = getInterviewChanceUpperBound(context.interviewChance);
  const lowInterviewChance = interviewChanceUpperBound !== null && interviewChanceUpperBound <= 5;
  const veryLowInterviewChance = interviewChanceUpperBound !== null && interviewChanceUpperBound <= 1;
  const strongMatchCount = context.strongMatchCount ?? 0;
  const veryHighEffort =
    applicationRequirements.includes('AI Interview Required') ||
    effortLevel === 'Very High' ||
    (applicationRequirements.includes('Coding Challenge Required') &&
      applicationRequirements.includes('Video Submission Required')) ||
    applicationRequirements.includes('Multi-hour Assessment Required');
  const highEffort = effortLevel === 'High' || veryHighEffort;
  const strongOpportunity = opportunityQuality === 'High';
  const weakerOpportunity = opportunityQuality === 'Low';
  const hasBlockingExperienceMismatch =
    /\b(?:major|severe) experience[- ]level mismatch\b/i.test(context.reasoning ?? '') ||
    /\bsenior[- ]level mismatch\b/i.test(context.reasoning ?? '');
  const applyPostingQualityAdjustment = (recommendation: Recommendation) =>
    ['Talent Network', 'Suspicious Posting'].includes(context.companyType ?? '')
      ? downgradeRecommendation(recommendation)
      : recommendation;

  if (score <= 3.5 || hasBlockingExperienceMismatch) {
    if (veryLowInterviewChance || context.hasExtremeMismatch) {
      return 'Hard Skip \u274c\u274c';
    }

    return 'Skip \u274c';
  }

  if (score >= 8) {
    if (veryHighEffort && lowInterviewChance) {
      return applyPostingQualityAdjustment('Apply ✅');
    }

    if (weakerOpportunity) {
      return applyPostingQualityAdjustment('Apply ✅');
    }

    if (strongOpportunity) {
      return applyPostingQualityAdjustment('Strong Apply ✅');
    }

    return applyPostingQualityAdjustment('Apply ✅');
  }

  if (score >= 7) {
    if ((highEffort && lowInterviewChance) || weakerOpportunity) {
      return applyPostingQualityAdjustment('Apply ✅');
    }

    return applyPostingQualityAdjustment('Apply ✅');
  }

  if (score >= 6) {
    if ((effortLevel === 'Low' || effortLevel === 'Medium') && !veryLowInterviewChance) {
      return applyPostingQualityAdjustment('Apply ✅');
    }

    return 'Skip ❌';
  }

  if (score >= 4) {
    return 'Skip ❌';
  }

  if (veryLowInterviewChance || context.hasExtremeMismatch) {
    return 'Hard Skip ❌❌';
  }

  return applyPostingQualityAdjustment(strongMatchCount >= 3 && !highEffort ? 'Apply ✅' : 'Skip ❌');
}

export function clampScore(score: number) {
  return Math.max(0, Math.min(10, Number(score.toFixed(1))));
}
