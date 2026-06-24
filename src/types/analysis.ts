export type Recommendation = 'Strong Apply ✅' | 'Apply ✅' | 'Skip ❌' | 'Hard Skip ❌❌';

export type MarketCompetition = 'Low' | 'Medium' | 'High' | 'Very High';

export type CompanyType =
  | 'Direct Employer'
  | 'Staffing Agency'
  | 'Talent Network'
  | 'Suspicious Posting'
  | 'Consulting'
  | 'Startup'
  | 'Unknown';

export type OpportunityQuality = 'High' | 'Medium' | 'Low';

export type EffortLevel = 'Low' | 'Medium' | 'High' | 'Very High';

export type EmploymentType =
  | 'Full-Time'
  | 'Part-Time'
  | 'Contract'
  | 'Part-Time Contract'
  | 'Full-Time Contract'
  | 'Contract-to-Hire'
  | 'Internship';

export type StrongMatch = {
  label: string;
};

export type AnalysisResult = {
  jobFitScore: number;
  recommendation: Recommendation;
  estimatedInterviewChance: string;
  marketCompetition: MarketCompetition;
  jobLogistics: string;
  employmentType?: EmploymentType;
  companyType: CompanyType;
  opportunityQuality: OpportunityQuality;
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
