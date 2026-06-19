export type Recommendation = 'Strong Apply ✅' | 'Apply ✅' | 'Borderline ⚠️' | 'Skip ❌' | 'Hard Skip ❌❌';

export type MarketCompetition = 'Low' | 'Medium' | 'High' | 'Very High';

export type EffortLevel = 'Low' | 'Medium' | 'High' | 'Very High';

export type StrongMatch = {
  label: string;
};

export type AnalysisResult = {
  jobFitScore: number;
  recommendation: Recommendation;
  estimatedInterviewChance: string;
  marketCompetition: MarketCompetition;
  jobLogistics: string;
  strongMatches: StrongMatch[];
  applicationRequirements: string[];
  effortLevel: EffortLevel;
  criticalGaps: string[];
  specializedGaps: string[];
  missingSkills: string[];
  missingSignals: string[];
  chanceReasons: string[];
  competitionFactors: string[];
  resumeImprovements: string[];
  reasoning: string;
};
