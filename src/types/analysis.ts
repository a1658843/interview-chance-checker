export type Recommendation = 'Strong Apply' | 'Apply' | 'Stretch' | 'Skip';

export type MarketCompetition = 'Low' | 'Medium' | 'High' | 'Very High';

export type StrongMatch = {
  label: string;
  evidence: string[];
};

export type AnalysisResult = {
  jobFitScore: number;
  recommendation: Recommendation;
  estimatedInterviewChance: string;
  marketCompetition: MarketCompetition;
  strongMatches: StrongMatch[];
  criticalGaps: string[];
  specializedGaps: string[];
  missingSkills: string[];
  missingSignals: string[];
  chanceReasons: string[];
  competitionFactors: string[];
  recruiterConcerns: string[];
  resumeImprovements: string[];
  reasoning: string;
};
