import { isStrongMatchSupportedByResume } from './strongMatches.js';

const unsupportedReasoningSkills = [
  'Node.js',
  'Vue.js',
  'AWS',
  'Ruby on Rails',
  'Rails',
  'Kubernetes',
  'Azure',
  'GCP',
  'Datadog',
];

function splitSentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function normalizedWords(text) {
  return new Set(
    String(text ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9+#.]+/g, ' ')
      .split(/\s+/)
      .map((word) => word.replace(/[.,;:]+$/g, ''))
      .filter((word) => word.length >= 4 && !['lack', 'lacks', 'missing', 'direct', 'experience'].includes(word)),
  );
}

function hasPreferredLanguage(sentence) {
  return /\b(preferred|nice[- ]to[- ]have|nice to have|bonus|bonus points?|plus|familiarity|exposure|knowledge of or interest in|interest in|technologies such as|ability to learn quickly|learn quickly|not candidates who already have experience with every technology)\b/i.test(sentence);
}

function hasRequiredLanguage(sentence) {
  return /\b(required|requirement|requirements|must have|must-have|minimum qualifications|qualifications|you have|need)\b/i.test(sentence);
}

function sharesMeaningfulTerms(gap, sentence) {
  const gapWords = normalizedWords(gap);
  const sentenceWords = normalizedWords(sentence);
  let shared = 0;

  for (const word of gapWords) {
    if (sentenceWords.has(word)) {
      shared += 1;
    }
  }

  return shared >= 1 || /\birt\b/i.test(gap) && /\birt\b/i.test(sentence);
}

export function isPreferredOnlyGap(gap, jobDescriptionText) {
  if (typeof gap !== 'string' || gap.trim().length === 0) {
    return false;
  }

  const sentences = splitSentences(jobDescriptionText);
  const relatedPreferredSentences = sentences.filter(
    (sentence) => hasPreferredLanguage(sentence) && sharesMeaningfulTerms(gap, sentence),
  );

  if (relatedPreferredSentences.length === 0) {
    return false;
  }

  const relatedRequiredSentences = sentences.filter(
    (sentence) => hasRequiredLanguage(sentence) && !hasPreferredLanguage(sentence) && sharesMeaningfulTerms(gap, sentence),
  );

  return relatedRequiredSentences.length === 0;
}

export function removePreferredOnlyCriticalGaps(analysis, jobDescriptionText) {
  const criticalGaps = Array.isArray(analysis?.criticalGaps) ? analysis.criticalGaps : [];
  const filteredCriticalGaps = criticalGaps.filter(
    (gap) => !isPreferredOnlyGap(gap, jobDescriptionText),
  );
  const removedPreferredOnlyGapCount = criticalGaps.length - filteredCriticalGaps.length;

  return {
    ...analysis,
    criticalGaps: filteredCriticalGaps,
    removedPreferredOnlyGapCount,
  };
}

function getYearsMentionedInGap(gap) {
  return Array.from(String(gap ?? '').matchAll(/\b(\d{1,2})\+?\s*(?:\+|plus)?\s*years?\b/gi)).map((match) =>
    Number(match[1]),
  );
}

function isUnsupportedInferredExperienceGap(gap, jobDescriptionText) {
  const value = String(gap ?? '');
  const requiredYears = getRequiredExperienceYears(jobDescriptionText);
  const gapYears = getYearsMentionedInGap(value);

  if (gapYears.length > 0) {
    return requiredYears === null || !gapYears.includes(requiredYears);
  }

  if (
    /\b(experience[- ]level mismatch|seniority mismatch|level mismatch|senior[- ]level|staff[- ]level|lead[- ]level|leadership|communication skills|required professional experience|professional experience beyond internship|demonstrated professional experience|more experience|too senior)\b/i.test(
      value,
    )
  ) {
    return requiredYears === null;
  }

  return false;
}

export function removeUnsupportedInferredCriticalGaps(analysis, jobDescriptionText) {
  const criticalGaps = Array.isArray(analysis?.criticalGaps) ? analysis.criticalGaps : [];

  return {
    ...analysis,
    criticalGaps: criticalGaps.filter((gap) => !isUnsupportedInferredExperienceGap(gap, jobDescriptionText)),
  };
}

function hasClearRedFlag(jobDescriptionText) {
  return /\b(pipeline|future talent|talent pool|evergreen|bench|resume database)\b/i.test(jobDescriptionText);
}

function hasDetailedResponsibilities(jobDescriptionText) {
  const responsibilitySignals = String(jobDescriptionText ?? '').match(
    /\b(responsibilities|what you'?ll do|what you will do|you will|develop|design|build|maintain|implement|collaborate|troubleshoot|integrate)\b/gi,
  );

  return (responsibilitySignals?.length ?? 0) >= 3;
}

function hasProductOrBusinessContext(jobDescriptionText) {
  return /\b(product|platform|solution|software|system|application|business|domain|clinical|trial|irt|healthcare|agriculture|auction|marketplace|patient|customer)\b/i.test(
    jobDescriptionText,
  );
}

function hasTeamOrRoleContext(jobDescriptionText) {
  return /\b(engineering team|development team|software team|department|reports to|manager|full[- ]time|software developer|software engineer)\b/i.test(
    jobDescriptionText,
  );
}

function hasSpecificStaffingDetails(jobDescriptionText) {
  return /\b(specific client|client is|end client|project|migration|implementation|contract duration|interview process|team size|onsite with client|hybrid with client)\b/i.test(
    jobDescriptionText,
  );
}

function classifyEmployerType(jobDescriptionText) {
  const text = String(jobDescriptionText ?? '');

  if (
    /\b(talent network|talent community|join our network|future opportunities|matching platform|candidate marketplace|talent pool|build your profile|create candidate account|future matching opportunities|workerbee|crossing hurdles)\b/i.test(
      text,
    )
  ) {
    return 'Talent Network';
  }

  if (
    /\b(stealth startup|confidential company|no company identity|company confidential|unrealistic compensation|minimal company information|generic responsibilities)\b/i.test(
      text,
    )
  ) {
    return 'Suspicious Posting';
  }

  if (
    /\b(dice|recruiter|recruiting firm|recruiting agency|staffing agency|staffing partner|staffing firm|contract placement|placement firm|posting for a client|client is seeking|our client)\b/i.test(
      text,
    )
  ) {
    return 'Staffing Agency';
  }

  return null;
}

function capInterviewChance(interviewChance, cap) {
  const currentRank = getInterviewChanceUpperBound(interviewChance);
  const capRank = getInterviewChanceUpperBound(cap);

  if (currentRank === null || capRank === null) {
    return interviewChance;
  }

  return currentRank > capRank ? cap : interviewChance;
}

function maxNumber(values) {
  return values.length > 0 ? Math.max(...values) : null;
}

function hasCompanyHistoryContext(sentence) {
  return /\b(legacy|in the market|trusted|serving customers|served customers|company has|founded|founded in|established|years in business|years of history|years of innovation|years of leadership)\b/i.test(
    sentence,
  );
}

function hasCandidateRequirementContext(sentence) {
  return /\b(required|requires|requirement|requirements|minimum|minimum qualifications|qualifications|must have|must-have|you have|need|needed|looking for|candidate|applicant|experience required|professional experience|software engineering experience|software development experience|developer experience|engineering experience)\b/i.test(
    sentence,
  );
}

function hasHardYearsRequirementContext(sentence) {
  return /\b(required|requires|requirement|requirements|minimum|minimum qualifications|must have|must-have|you have|need|needed|experience required)\b/i.test(
    sentence,
  );
}

const educationLevels = {
  Bachelor: 1,
  Master: 2,
  PhD: 3,
};

function getEducationLevelLabel(level) {
  if (level === educationLevels.PhD) return 'PhD';
  if (level === educationLevels.Master) return "Master's";
  if (level === educationLevels.Bachelor) return "Bachelor's";
  return null;
}

function getEducationLevelFromText(text) {
  const value = String(text ?? '');

  if (/\b(ph\.?\s*d\.?|doctorate|doctoral degree)\b/i.test(value)) {
    return educationLevels.PhD;
  }

  if (
    /\b(m\.?\s*s\.?|m\.?\s*eng\.?|master'?s?|masters|master of science|master of engineering|mba)\b/i.test(value)
  ) {
    return educationLevels.Master;
  }

  if (/\b(b\.?\s*s\.?|b\.?\s*a\.?|bachelor'?s?|bachelors|bachelor of science|bachelor of arts)\b/i.test(value)) {
    return educationLevels.Bachelor;
  }

  return null;
}

function hasEducationRequirementContext(sentence) {
  return /\b(required|requires|requirement|requirements|minimum|minimum qualifications|qualifications|must have|must-have|you have|need|needed|degree required|education required)\b/i.test(
    sentence,
  );
}

function isRequiredSectionHeading(line) {
  return /\b(requirements|qualifications|minimum qualifications|must have|what you bring|you have|what we are looking for)\b/i.test(
    line,
  );
}

function isOptionalSectionHeading(line) {
  return /\b(preferred|nice[- ]to[- ]have|nice to have|bonus|plus|extra credit|knowledge of or interest in|technologies such as|interest in)\b/i.test(line);
}

export function getRequiredEducationLevel(jobDescriptionText) {
  const levels = [];
  let section = 'general';

  for (const line of String(jobDescriptionText ?? '').split(/\r?\n/)) {
    const trimmedLine = line.trim();
    const isHeading =
      trimmedLine.length < 100 &&
      !/[.!?]$/.test(trimmedLine) &&
      getEducationLevelFromText(trimmedLine) === null;

    if (isHeading && isOptionalSectionHeading(trimmedLine)) {
      section = 'optional';
      continue;
    }

    if (isHeading && isRequiredSectionHeading(trimmedLine)) {
      section = 'required';
      continue;
    }

    for (const sentence of splitSentences(trimmedLine)) {
      if (section === 'optional') {
        continue;
      }

      if (hasPreferredLanguage(sentence) && !hasRequiredLanguage(sentence)) {
        continue;
      }

      const requiredContext = section === 'required' || hasEducationRequirementContext(sentence);
      if (!requiredContext) {
        continue;
      }

      const level = getEducationLevelFromText(sentence);
      if (level !== null) {
        levels.push(level);
      }
    }
  }

  return maxNumber(levels);
}

export function getResumeEducationLevel(resumeText) {
  return getEducationLevelFromText(resumeText);
}

export function getRequiredExperienceYears(jobDescriptionText) {
  const years = [];

  for (const sentence of splitSentences(jobDescriptionText)) {
    if (hasCompanyHistoryContext(sentence) || !hasCandidateRequirementContext(sentence)) {
      continue;
    }

    if (hasPreferredLanguage(sentence) && !hasHardYearsRequirementContext(sentence)) {
      continue;
    }

    for (const match of sentence.matchAll(/\b(?:at least|minimum of|minimum|required)?\s*(\d{1,2})\+?\s*(?:\+|plus)?\s*years?\b/gi)) {
      years.push(Number(match[1]));
    }
  }

  return maxNumber(years);
}

export function getExplicitCandidateExperienceYears(resumeText) {
  const text = String(resumeText ?? '');
  const years = [];
  const patterns = [
    /\b(\d{1,2})\+?\s*(?:\+|plus)?\s*years?\s+(?:of\s+)?(?:professional\s+)?(?:software\s+)?(?:engineering|development|developer|programming|backend|frontend|full[- ]stack|industry|work)?\s*experience\b/gi,
    /\b(?:over|more than|at least)\s+(\d{1,2})\s+years?\s+(?:of\s+)?(?:professional\s+)?(?:software\s+)?(?:engineering|development|developer|programming|backend|frontend|full[- ]stack|industry|work)?\s*experience\b/gi,
    /\bexperience\s*:\s*(\d{1,2})\+?\s*years?\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      years.push(Number(match[1]));
    }
  }

  return maxNumber(years);
}

function getConservativeCandidateExperienceYears(resumeText, candidateLevel) {
  const explicitYears = getExplicitCandidateExperienceYears(resumeText);

  if (explicitYears !== null) {
    return explicitYears;
  }

  if (candidateLevel === 'Staff') return 9;
  if (candidateLevel === 'Senior') return 6;
  if (candidateLevel === 'Mid') return 3;
  return 1;
}

function hasJuniorFriendlyLanguage(jobDescriptionText) {
  return /\b(entry[- ]level|associate|new grad|graduate|junior|0\s*-\s*2 years?|0-2 years?|junior candidates welcome|early career|will train|training provided|internships? count|academic projects? count|school projects? count|course projects? count|personal projects? count|open[- ]source contributions?|professional work|internships?|academic projects?|personal projects?|multiple levels|depending on experience|ability to learn quickly|learn quickly|not candidates who already have experience with every technology)\b/i.test(
    jobDescriptionText,
  );
}

function hasStrongProductionOwnership(jobDescriptionText) {
  return /\b(production ownership|own production|architecture ownership|architectural ownership|lead projects|technical lead|design and architecture|system design|mentor|mentoring|high[- ]scale|high throughput|distributed systems)\b/i.test(
    jobDescriptionText,
  );
}

function hasStaffLevelOwnership(jobDescriptionText) {
  return /\b(approve code standards|code standards|organization[- ]wide|org[- ]wide|strategic technical direction|technical strategy|cross[- ]team ownership|cross[- ]team technical leadership|principal-level|staff-level)\b/i.test(
    jobDescriptionText,
  );
}

function hasSeniorLevelOwnership(jobDescriptionText) {
  return /\b(architecture ownership|architectural ownership|own architecture|lead projects|lead technical projects|technical leadership|technical lead|mentor|mentoring|system design|design and architecture|production ownership|own production)\b/i.test(
    jobDescriptionText,
  );
}

function hasAdvancedMidToSeniorExpectations(jobDescriptionText) {
  const text = String(jobDescriptionText ?? '');
  const advancedSignals = [
    /\bazure deployment\b/i,
    /\bcloud deployment\b/i,
    /\bdeploy(?:ing)? to azure\b/i,
    /\bllm integration\b/i,
    /\bsemantic kernel\b/i,
    /\blangchain\b/i,
    /\bproduction deployment\b/i,
    /\bproduction systems?\b/i,
  ];

  return advancedSignals.filter((signal) => signal.test(text)).length >= 2;
}

export function inferCandidateLevel(resumeText) {
  const text = String(resumeText ?? '');
  const years = getExplicitCandidateExperienceYears(text);
  const juniorSignals = /\b(internship|intern|academic project|class project|course project|student|new grad|contract work|short contract|bootcamp)\b/i.test(text);
  const seniorTitleSignals = /\b(senior software engineer|senior developer|staff engineer|principal engineer|architect)\b/i.test(text);
  const seniorLeadershipSignals = /\b(mentored|mentoring|technical lead|led engineering team|cross[- ]team|organization[- ]wide|org[- ]wide|technical strategy|architecture decisions)\b/i.test(text);
  const midOwnershipSignals = /\b(independent feature|owned feature|feature delivery|production feature|shipped|production system|production systems|professional software engineer|software engineer\b)\b/i.test(text);

  if ((years === null || years < 2) && juniorSignals && !seniorTitleSignals && !seniorLeadershipSignals) {
    return 'Junior';
  }

  if (years !== null) {
    if (years >= 8) return 'Staff';
    if (years >= 5) return 'Senior';
    if (years >= 2) return 'Mid';
  }

  if (/\b(staff|principal|architect)\b/i.test(text) && /\b(cross[- ]team|organization|org[- ]level|technical strategy)\b/i.test(text)) {
    return 'Staff';
  }

  if (seniorTitleSignals || seniorLeadershipSignals) {
    return 'Senior';
  }

  if (midOwnershipSignals) {
    return 'Mid';
  }

  return 'Junior';
}

export function inferJobLevel(jobDescriptionText) {
  const text = String(jobDescriptionText ?? '');
  const years = getRequiredExperienceYears(text);

  if (
    /\b(staff|principal|architect|engineer\s*v|level\s*v)\b/i.test(text) ||
    (years !== null && years >= 8) ||
    hasStaffLevelOwnership(text)
  ) {
    return 'Staff';
  }

  if (
    /\b(senior|lead engineer|engineer\s*iv|level\s*iv)\b/i.test(text) ||
    (years !== null && years >= 5) ||
    (years !== null && years >= 4 && hasAdvancedMidToSeniorExpectations(text)) ||
    hasSeniorLevelOwnership(text)
  ) {
    return 'Senior';
  }

  if (
    /\b(software engineer ii|engineer ii|engineer iii|level ii|level iii)\b/i.test(text) ||
    (years !== null && years >= 2) ||
    /\b(mid[- ]level|level ii|independent contributor)\b/i.test(text)
  ) {
    return 'Mid';
  }

  return 'Junior';
}

function getLevelGap(candidateLevel, jobLevel) {
  const order = {
    Junior: 0,
    Mid: 1,
    Senior: 2,
    Staff: 3,
  };
  const gap = order[jobLevel] - order[candidateLevel];

  if (gap >= 3) return 'Severe';
  if (gap === 2) return 'Large';
  if (gap === 1) return candidateLevel === 'Senior' && jobLevel === 'Staff' ? 'Small' : 'Moderate';
  return 'None';
}

function addCriticalGap(criticalGaps, gap) {
  const existingGaps = Array.isArray(criticalGaps) ? criticalGaps : [];

  if (existingGaps.some((existingGap) => existingGap.toLowerCase() === gap.toLowerCase())) {
    return existingGaps;
  }

  return [gap, ...existingGaps];
}

function getRecommendationCapRank(recommendation) {
  const ranks = {
    'Hard Skip ❌❌': 0,
    'Skip ❌': 1,
    'Apply ✅': 2,
    'Strong Apply ✅': 3,
  };

  return ranks[recommendation] ?? 4;
}

function getMoreRestrictiveRecommendationCap(...caps) {
  return caps
    .filter(Boolean)
    .sort((a, b) => getRecommendationCapRank(a) - getRecommendationCapRank(b))[0] ?? null;
}

function getCareerLevelPenalty(candidateLevel, jobLevel) {
  if (candidateLevel === 'Junior' && jobLevel === 'Mid') return 0.75;
  if (candidateLevel === 'Junior' && jobLevel === 'Senior') return 2.0;
  if (candidateLevel === 'Junior' && jobLevel === 'Staff') return 3.0;
  if (candidateLevel === 'Mid' && jobLevel === 'Senior') return 1.0;
  if (candidateLevel === 'Mid' && jobLevel === 'Staff') return 2.0;
  if (candidateLevel === 'Senior' && jobLevel === 'Staff') return 1.0;
  return 0;
}

function getCareerLevelScoreCap(candidateLevel, jobLevel, juniorFriendly) {
  if (juniorFriendly) {
    return null;
  }

  if (candidateLevel === 'Junior' && jobLevel === 'Staff') return 6.0;
  if (candidateLevel === 'Junior' && jobLevel === 'Senior') return 6.9;
  if (candidateLevel === 'Junior' && jobLevel === 'Mid') return 7.5;
  if (candidateLevel === 'Mid' && jobLevel === 'Staff') return 7.0;
  if (candidateLevel === 'Mid' && jobLevel === 'Senior') return 8.0;
  if (candidateLevel === 'Senior' && jobLevel === 'Staff') return 8.5;
  return null;
}

function getCareerLevelRecommendationCap(candidateLevel, jobLevel, juniorFriendly, requiredYears, productionOwnership) {
  if (juniorFriendly) {
    return null;
  }

  if (candidateLevel === 'Junior' && jobLevel === 'Staff') return 'Skip ❌';
  if (candidateLevel === 'Junior' && jobLevel === 'Senior') return 'Skip ❌';
  if (candidateLevel === 'Junior' && jobLevel === 'Mid') return 'Apply ✅';
  if (candidateLevel === 'Mid' && jobLevel === 'Staff') return 'Skip ❌';
  if (candidateLevel === 'Mid' && jobLevel === 'Senior') return 'Apply ✅';
  return null;
}

function getExperienceGate(requiredYears, candidateYears, juniorFriendly) {
  if (requiredYears === null) return 'Pass';
  if (candidateYears >= requiredYears) return 'Pass';
  if (juniorFriendly && requiredYears <= 2) return 'Pass';
  if (juniorFriendly && requiredYears <= 3 && candidateYears >= requiredYears - 1) return 'Soft Gap';
  if (requiredYears >= 8 && candidateYears < 3) return 'Severe Gap';
  if (requiredYears >= 5 && candidateYears < 2) return 'Severe Gap';
  if (requiredYears === 4 && candidateYears < 2) return 'Hard Gap';
  if (requiredYears <= 3 && candidateYears >= requiredYears - 1) return 'Soft Gap';
  return 'Hard Gap';
}

function getExperienceGateRecommendationCap(experienceGate, requiredYears) {
  if (experienceGate === 'Severe Gap') {
    return requiredYears !== null && requiredYears >= 8 ? 'Hard Skip ❌❌' : 'Skip ❌';
  }

  if (experienceGate === 'Hard Gap') {
    return 'Skip ❌';
  }

  return null;
}

function getExperienceGateInterviewChance(experienceGate) {
  if (experienceGate === 'Severe Gap') return '<1%';
  if (experienceGate === 'Hard Gap') return '1-3%';
  return null;
}

function addExperienceGateCriticalGap(criticalGaps, requiredYears) {
  if (requiredYears === null) {
    return criticalGaps;
  }

  return addCriticalGap(criticalGaps, `${requiredYears}+ years experience requirement not met`);
}

function getEducationGate(requiredEducationLevel, resumeEducationLevel) {
  if (requiredEducationLevel === null) return 'Pass';
  if (resumeEducationLevel !== null && resumeEducationLevel >= requiredEducationLevel) return 'Pass';

  if (requiredEducationLevel === educationLevels.PhD) {
    return resumeEducationLevel === educationLevels.Master ? 'Hard Gap' : 'Severe Gap';
  }

  return 'Gap';
}

function getEducationGateRecommendationCap(educationGate) {
  if (educationGate === 'Severe Gap') return 'Hard Skip ❌❌';
  if (educationGate === 'Hard Gap') return 'Skip ❌';
  if (educationGate === 'Gap') return 'Skip ❌';
  return null;
}

function getEducationGateInterviewChance(educationGate) {
  if (educationGate === 'Severe Gap') return '<1%';
  if (educationGate === 'Hard Gap') return '1-3%';
  if (educationGate === 'Gap') return '1-2%';
  return null;
}

function getEducationGateScoreCap(educationGate) {
  if (educationGate === 'Severe Gap') return 3.9;
  if (educationGate === 'Hard Gap') return 5.0;
  if (educationGate === 'Gap') return 6.5;
  return 6.5;
}

function addEducationGateCriticalGap(criticalGaps, requiredEducationLevel) {
  const label = getEducationLevelLabel(requiredEducationLevel);
  return label ? addCriticalGap(criticalGaps, `${label} degree required`) : criticalGaps;
}

export function applyCandidateJobLevelGuardrails(analysis, { resumeText, jobDescriptionText }) {
  const candidateLevel = inferCandidateLevel(resumeText);
  const jobLevel = inferJobLevel(jobDescriptionText);
  const levelGap = getLevelGap(candidateLevel, jobLevel);
  const requiredYears = getRequiredExperienceYears(jobDescriptionText);
  const candidateYears = getConservativeCandidateExperienceYears(resumeText, candidateLevel);
  const requiredEducationLevel = getRequiredEducationLevel(jobDescriptionText);
  const resumeEducationLevel = getResumeEducationLevel(resumeText);
  const juniorFriendly = hasJuniorFriendlyLanguage(jobDescriptionText);
  const productionOwnership = hasStrongProductionOwnership(jobDescriptionText);
  const experienceGate = getExperienceGate(requiredYears, candidateYears, juniorFriendly);
  const experienceGateRecommendationCap = getExperienceGateRecommendationCap(experienceGate, requiredYears);
  const experienceGateInterviewChance = getExperienceGateInterviewChance(experienceGate);
  const educationGate = getEducationGate(requiredEducationLevel, resumeEducationLevel);
  const educationGateRecommendationCap = getEducationGateRecommendationCap(educationGate);
  const educationGateInterviewChance = getEducationGateInterviewChance(educationGate);
  const educationGateScoreCap = getEducationGateScoreCap(educationGate);
  const careerLevelPenalty = getCareerLevelPenalty(candidateLevel, jobLevel);
  const careerLevelScoreCap = getCareerLevelScoreCap(candidateLevel, jobLevel, juniorFriendly);
  const recommendationCap = getCareerLevelRecommendationCap(
    candidateLevel,
    jobLevel,
    juniorFriendly,
    requiredYears,
    productionOwnership,
  );
  let guardedAnalysis = {
    ...analysis,
    candidateLevel,
    jobLevel,
    levelGap,
    requiredExperienceYears: requiredYears,
    candidateExperienceYears: candidateYears,
    experienceGate,
    requiredEducationLevel,
    resumeEducationLevel,
    educationGate,
  };
  const addExperienceYearsGap = (criticalGaps) => {
    if (requiredYears === null || requiredYears < 3 || experienceGate === 'Pass') {
      return criticalGaps;
    }

    return addExperienceGateCriticalGap(criticalGaps, requiredYears);
  };

  if (careerLevelPenalty > 0 && !juniorFriendly) {
    const penalizedScore = Math.max(0, Number(guardedAnalysis.fitScore ?? 0) - careerLevelPenalty);
    const cappedScore =
      careerLevelScoreCap === null ? penalizedScore : Math.min(penalizedScore, careerLevelScoreCap);
    const mismatchGap =
      levelGap === 'Severe'
        ? 'Severe experience-level mismatch'
        : levelGap === 'Large'
          ? 'Major experience-level mismatch'
          : 'Moderate experience-level mismatch';

    guardedAnalysis = {
      ...guardedAnalysis,
      fitScore: Number(cappedScore.toFixed(1)),
      recommendationCap: getMoreRestrictiveRecommendationCap(
        experienceGateRecommendationCap,
        educationGateRecommendationCap,
        recommendationCap,
        guardedAnalysis.recommendationCap,
      ),
      criticalGaps:
        requiredYears === null
          ? guardedAnalysis.criticalGaps
          : addCriticalGap(guardedAnalysis.criticalGaps, mismatchGap),
    };
  }

  if (educationGate !== 'Pass') {
    guardedAnalysis = {
      ...guardedAnalysis,
      fitScore: Number(Math.min(Number(guardedAnalysis.fitScore ?? 0), educationGateScoreCap).toFixed(1)),
      recommendationCap: getMoreRestrictiveRecommendationCap(
        educationGateRecommendationCap,
        guardedAnalysis.recommendationCap,
      ),
      interviewChance: educationGateInterviewChance ?? guardedAnalysis.interviewChance,
      criticalGaps: addEducationGateCriticalGap(guardedAnalysis.criticalGaps, requiredEducationLevel),
    };
  }

  if (experienceGateRecommendationCap || experienceGateInterviewChance) {
    guardedAnalysis = {
      ...guardedAnalysis,
      recommendationCap: getMoreRestrictiveRecommendationCap(
        experienceGateRecommendationCap,
        guardedAnalysis.recommendationCap,
      ),
      interviewChance: experienceGateInterviewChance ?? guardedAnalysis.interviewChance,
    };
  }

  guardedAnalysis = {
    ...guardedAnalysis,
    criticalGaps: addExperienceYearsGap(guardedAnalysis.criticalGaps),
  };

  return guardedAnalysis;
}

export function applyOpportunityQualityGuardrails(analysis, jobDescriptionText) {
  const detectedCompanyType = classifyEmployerType(jobDescriptionText);
  const companyType = detectedCompanyType ?? analysis?.companyType ?? 'Unknown';

  if (companyType === 'Talent Network') {
    return {
      ...analysis,
      companyType,
      opportunityQuality: 'Medium',
      interviewChance: capInterviewChance(analysis?.interviewChance, '3-7%'),
    };
  }

  if (companyType === 'Suspicious Posting') {
    return {
      ...analysis,
      companyType,
      opportunityQuality: 'Medium',
      interviewChance: capInterviewChance(analysis?.interviewChance, '3-7%'),
    };
  }

  if (
    companyType === 'Direct Employer' &&
    !hasClearRedFlag(jobDescriptionText) &&
    hasDetailedResponsibilities(jobDescriptionText) &&
    (hasProductOrBusinessContext(jobDescriptionText) || hasTeamOrRoleContext(jobDescriptionText))
  ) {
    return {
      ...analysis,
      companyType,
      opportunityQuality: 'High',
    };
  }

  if (companyType === 'Staffing Agency') {
    return {
      ...analysis,
      companyType,
      opportunityQuality: hasSpecificStaffingDetails(jobDescriptionText) ? 'Medium' : 'Low',
      interviewChance: capInterviewChance(analysis?.interviewChance, '5-10%'),
    };
  }

  return {
    ...analysis,
    companyType,
  };
}

function removeSkillFromReasoning(reasoning, skill) {
  return reasoning
    .replace(new RegExp(`,?\\s+and\\s+${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), '')
    .replace(new RegExp(`${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,\\s*`, 'gi'), '')
    .replace(new RegExp(`\\s*,\\s*${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), '')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function sanitizeUnsupportedReasoningSkills(analysis, resumeText) {
  let shortReasoning = splitSentences(analysis?.shortReasoning).join(' ');

  for (const sentence of splitSentences(shortReasoning)) {
    const lowerSentence = sentence.toLowerCase();
    const isGapSentence = /\b(lack|lacks|missing|without|no direct|does not have|doesn't have)\b/i.test(sentence);

    if (isGapSentence) {
      continue;
    }

    let sanitizedSentence = sentence;

    for (const skill of unsupportedReasoningSkills) {
      if (
        lowerSentence.includes(skill.toLowerCase()) &&
        !isStrongMatchSupportedByResume(skill, resumeText)
      ) {
        sanitizedSentence = removeSkillFromReasoning(sanitizedSentence, skill);
      }
    }

    if (sanitizedSentence !== sentence) {
      shortReasoning = shortReasoning.replace(sentence, sanitizedSentence);
    }
  }

  return {
    ...analysis,
    shortReasoning,
  };
}

function normalizePublicLanguage(text) {
  return String(text ?? '')
    .replace(/\bhis resume\b/gi, 'the resume')
    .replace(/\bhis\b/gi, 'the candidate’s');
}

function mentionsDifferentOpportunityQuality(analysis) {
  const reasoning = String(analysis?.shortReasoning ?? '').toLowerCase();
  const quality = analysis?.opportunityQuality;

  if (!quality || !reasoning) {
    return false;
  }

  const qualityPhrases = {
    High: ['low opportunity quality', 'low quality opportunity', 'medium opportunity quality'],
    Medium: ['high opportunity quality', 'strong opportunity quality', 'low opportunity quality', 'low quality opportunity'],
    Low: ['medium opportunity quality', 'high opportunity quality', 'strong opportunity quality'],
  };

  return (qualityPhrases[quality] ?? []).some((phrase) => reasoning.includes(phrase));
}

function impliesDifferentCompanyType(analysis) {
  const reasoning = String(analysis?.shortReasoning ?? '').toLowerCase();
  const companyType = analysis?.companyType;

  if (!companyType || !reasoning) {
    return false;
  }

  if (companyType === 'Staffing Agency') {
    return [
      'direct employer',
      'internal product team',
      'internal engineering team',
      'own product team',
      'clear internal team',
    ].some((phrase) => reasoning.includes(phrase));
  }

  if (companyType === 'Direct Employer') {
    return ['staffing agency', 'recruiting agency', 'staffing vendor'].some((phrase) =>
      reasoning.includes(phrase),
    );
  }

  return false;
}

function contradictsRecommendation(analysis) {
  const reasoning = String(analysis?.shortReasoning ?? '').toLowerCase();
  const recommendation = analysis?.recommendation;

  if (!recommendation || !reasoning) {
    return false;
  }

  if (recommendation === 'Strong Apply ✅') {
    return [
      'not a strong apply',
      'apply',
      'apply only if',
      'skip',
      'low expected return',
      'not worth',
    ].some((phrase) => reasoning.includes(phrase));
  }

  if (recommendation === 'Apply ✅') {
    return ['top priority', 'must apply', 'highest priority', 'strong apply', 'worth prioritizing'].some(
      (phrase) => reasoning.includes(phrase),
    );
  }

  if (recommendation === 'Apply ✅') {
    return ['top priority', 'must apply', 'highest priority', 'skip', 'do not apply', 'not worth'].some(
      (phrase) => reasoning.includes(phrase),
    );
  }

  if (recommendation === 'Skip ❌' || recommendation === 'Hard Skip ❌❌') {
    return ['top priority', 'must apply', 'highest priority', 'strong apply', 'apply normally'].some(
      (phrase) => reasoning.includes(phrase),
    );
  }

  return false;
}

function hasUnsupportedPositiveSkillClaim(analysis, resumeText) {
  return splitSentences(analysis?.shortReasoning).some((sentence) => {
    const isGapSentence = /\b(lack|lacks|missing|without|no direct|does not have|doesn't have)\b/i.test(sentence);

    if (isGapSentence) {
      return false;
    }

    return unsupportedReasoningSkills.some(
      (skill) =>
        sentence.toLowerCase().includes(skill.toLowerCase()) &&
        !isStrongMatchSupportedByResume(skill, resumeText),
    );
  });
}

function treatsPreferredOnlyGapAsBlocker(analysis, jobDescriptionText) {
  return splitSentences(analysis?.shortReasoning).some((sentence) => {
    const blockerLanguage = /\b(major blocker|hard blocker|critical blocker|critical gap|critical missing|primary weakness|disqualifying|disqualifier)\b/i.test(
      sentence,
    );

    return blockerLanguage && isPreferredOnlyGap(sentence, jobDescriptionText);
  });
}

function hasRecommendationQualityContradiction(analysis) {
  return analysis?.recommendation === 'Strong Apply ✅' && analysis?.opportunityQuality === 'Low';
}

function hasLevelMismatchScoreContradiction(analysis) {
  return ['Large', 'Severe'].includes(analysis?.levelGap) && Number(analysis?.fitScore ?? 0) > 7;
}

function hasLevelMismatchRecommendationContradiction(analysis) {
  return (
    ['Large', 'Severe'].includes(analysis?.levelGap) &&
    ['Apply ✅', 'Strong Apply ✅'].includes(analysis?.recommendation)
  );
}

function hasLevelMismatchReasoningIssue(analysis) {
  if (!['Large', 'Severe'].includes(analysis?.levelGap)) {
    return false;
  }

  return !/\b(experience[- ]level mismatch|seniority mismatch|level mismatch|too senior|senior-level|staff-level)\b/i.test(
    String(analysis?.shortReasoning ?? ''),
  );
}

function hasExperienceGateReasoningIssue(analysis) {
  if (!['Hard Gap', 'Severe Gap'].includes(analysis?.experienceGate)) {
    return false;
  }

  const reasoning = String(analysis?.shortReasoning ?? '');

  return !/\b(experience[- ]level mismatch|experience requirement|years requirement|seniority|demonstrated professional experience|far above)\b/i.test(
    reasoning,
  );
}

function hasEducationGateReasoningIssue(analysis) {
  if (!['Gap', 'Hard Gap', 'Severe Gap'].includes(analysis?.educationGate)) {
    return false;
  }

  return !/\b(education|degree|bachelor|master|phd|ph\.?d|doctorate)\b/i.test(
    String(analysis?.shortReasoning ?? ''),
  );
}

function hasUnsupportedPositiveYearsClaim(analysis, { resumeText, jobDescriptionText }) {
  const requiredYears = analysis?.requiredExperienceYears ?? getRequiredExperienceYears(jobDescriptionText);
  const candidateYears = analysis?.candidateExperienceYears ?? getExplicitCandidateExperienceYears(resumeText);

  if (requiredYears === null || (candidateYears !== null && candidateYears >= requiredYears)) {
    return false;
  }

  return splitSentences(analysis?.shortReasoning).some((sentence) => {
    const isGapSentence = /\b(lack|lacks|missing|below|short of|does not meet|doesn't meet|not meet|gap|mismatch|requires|required)\b/i.test(
      sentence,
    );

    if (isGapSentence) {
      return false;
    }

    return (
      new RegExp(`\\b(meets|satisfies|has|shows|demonstrates|brings|with)\\b[^.?!]{0,80}\\b${requiredYears}\\+?\\s*years?\\b`, 'i').test(sentence) ||
      new RegExp(`\\b${requiredYears}\\+?\\s*years?\\b[^.?!]{0,80}\\b(experience|requirement|required)\\b`, 'i').test(sentence)
    );
  });
}

function hasFinalConsistencyIssue(analysis, { resumeText, jobDescriptionText }) {
  return (
    mentionsDifferentOpportunityQuality(analysis) ||
    impliesDifferentCompanyType(analysis) ||
    contradictsRecommendation(analysis) ||
    hasUnsupportedPositiveSkillClaim(analysis, resumeText) ||
    treatsPreferredOnlyGapAsBlocker(analysis, jobDescriptionText) ||
    hasRecommendationQualityContradiction(analysis) ||
    hasLevelMismatchScoreContradiction(analysis) ||
    hasLevelMismatchRecommendationContradiction(analysis) ||
    hasLevelMismatchReasoningIssue(analysis) ||
    hasExperienceGateReasoningIssue(analysis) ||
    hasEducationGateReasoningIssue(analysis) ||
    hasUnsupportedPositiveYearsClaim(analysis, { resumeText, jobDescriptionText }) ||
    /\b(candidate should apply only if|candidate is especially interested)\b/i.test(
      String(analysis?.shortReasoning ?? ''),
    )
  );
}

function getRecommendationRank(recommendation) {
  const ranks = {
    'Hard Skip ❌❌': 0,
    'Skip ❌': 1,
    'Apply ✅': 2,
    'Strong Apply ✅': 3,
  };

  return ranks[recommendation] ?? 0;
}

function capRecommendation(recommendation, cap) {
  if (!cap) {
    return recommendation;
  }

  return getRecommendationRank(recommendation) > getRecommendationRank(cap) ? cap : recommendation;
}

function getInterviewChanceUpperBound(interviewChance) {
  const value = String(interviewChance ?? '');
  const matches = [...value.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));

  if (matches.length === 0) {
    return value.includes('<') ? 1 : null;
  }

  return Math.max(...matches);
}

function getStrongMatchCount(analysis) {
  return Array.isArray(analysis?.strongMatches) ? analysis.strongMatches.length : 0;
}

function hasExtremeMismatchForHardSkip(analysis) {
  const criticalGaps = Array.isArray(analysis?.criticalGaps) ? analysis.criticalGaps.join(' ') : '';
  const interviewChanceUpperBound = getInterviewChanceUpperBound(analysis?.interviewChance);

  return (
    (interviewChanceUpperBound !== null && interviewChanceUpperBound <= 1) ||
    analysis?.educationGate === 'Severe Gap' ||
    (analysis?.experienceGate === 'Severe Gap' && Number(analysis?.requiredExperienceYears ?? 0) >= 8) ||
    analysis?.levelGap === 'Severe' ||
    /\b(security clearance|active clearance|secret clearance|top secret|phd|ph\.?d|doctorate|embedded systems?|ios|swift|android|kotlin|golang|go\b|machine learning|ml\b|data scientist|data science)\b/i.test(
      criticalGaps,
    )
  );
}

function softenUnsupportedHardSkip(analysis) {
  if (analysis?.recommendation !== 'Hard Skip ❌❌' || hasExtremeMismatchForHardSkip(analysis)) {
    return analysis;
  }

  return {
    ...analysis,
    recommendation: getStrongMatchCount(analysis) >= 3 ? 'Apply ✅' : 'Skip ❌',
  };
}

function hasBlockingExperienceMismatchForRecommendation(analysis) {
  const reasoningText = [
    analysis?.shortReasoning,
    ...(Array.isArray(analysis?.criticalGaps) ? analysis.criticalGaps : []),
  ].join(' ');

  return (
    /\b(?:major|severe) experience[- ]level mismatch\b/i.test(reasoningText) ||
    /\bsenior[- ]level mismatch\b/i.test(reasoningText)
  );
}

function applyRecommendationHardRules(analysis) {
  const recommendationType = getRecommendationType(analysis?.recommendation);
  const score = Number(analysis?.fitScore);
  const mustNotApply =
    (Number.isFinite(score) && score <= 3.5) ||
    hasBlockingExperienceMismatchForRecommendation(analysis);

  if (!mustNotApply || !['Apply', 'Strong Apply'].includes(recommendationType)) {
    return analysis;
  }

  return {
    ...analysis,
    recommendation: hasExtremeMismatchForHardSkip(analysis) ? 'Hard Skip \u274c\u274c' : 'Skip \u274c',
  };
}

function repairRecommendationForConsistency(analysis) {
  let repairedBeforeCap = { ...analysis };

  if (repairedBeforeCap?.levelGap === 'Severe') {
    repairedBeforeCap = {
      ...repairedBeforeCap,
      fitScore: Math.min(Number(repairedBeforeCap.fitScore ?? 0), 6.0),
      recommendationCap: repairedBeforeCap.recommendationCap ?? 'Skip ❌',
    };
  } else if (repairedBeforeCap?.levelGap === 'Large') {
    repairedBeforeCap = {
      ...repairedBeforeCap,
      fitScore: Math.min(Number(repairedBeforeCap.fitScore ?? 0), 6.9),
      recommendationCap: repairedBeforeCap.recommendationCap ?? 'Skip ❌',
    };
  }

  if (repairedBeforeCap?.experienceGate === 'Severe Gap') {
    repairedBeforeCap = {
      ...repairedBeforeCap,
      recommendationCap:
        repairedBeforeCap.recommendationCap ??
        (Number(repairedBeforeCap.requiredExperienceYears ?? 0) >= 8 ? 'Hard Skip ❌❌' : 'Skip ❌'),
      interviewChance: '<1%',
    };
  } else if (repairedBeforeCap?.experienceGate === 'Hard Gap') {
    repairedBeforeCap = {
      ...repairedBeforeCap,
      recommendationCap: repairedBeforeCap.recommendationCap ?? 'Skip ❌',
      interviewChance: repairedBeforeCap.interviewChance === '<1%' ? '<1%' : '1-3%',
    };
  }

  if (repairedBeforeCap?.educationGate === 'Severe Gap') {
    repairedBeforeCap = {
      ...repairedBeforeCap,
      fitScore: Math.min(Number(repairedBeforeCap.fitScore ?? 0), 3.9),
      recommendationCap: getMoreRestrictiveRecommendationCap(
        'Hard Skip ❌❌',
        repairedBeforeCap.recommendationCap,
      ),
      interviewChance: '<1%',
    };
  } else if (repairedBeforeCap?.educationGate === 'Hard Gap') {
    repairedBeforeCap = {
      ...repairedBeforeCap,
      fitScore: Math.min(Number(repairedBeforeCap.fitScore ?? 0), 5.0),
      recommendationCap: getMoreRestrictiveRecommendationCap(
        'Skip ❌',
        repairedBeforeCap.recommendationCap,
      ),
      interviewChance: repairedBeforeCap.interviewChance === '<1%' ? '<1%' : '1-3%',
    };
  } else if (repairedBeforeCap?.educationGate === 'Gap') {
    repairedBeforeCap = {
      ...repairedBeforeCap,
      fitScore: Math.min(Number(repairedBeforeCap.fitScore ?? 0), 6.5),
      recommendationCap: getMoreRestrictiveRecommendationCap(
        'Skip ❌',
        repairedBeforeCap.recommendationCap,
      ),
      interviewChance: ['<1%', '1-2%'].includes(repairedBeforeCap.interviewChance)
        ? repairedBeforeCap.interviewChance
        : '1-2%',
    };
  }

  const cappedRecommendation = capRecommendation(
    repairedBeforeCap?.recommendation,
    repairedBeforeCap?.recommendationCap,
  );
  let repairedAnalysis = softenUnsupportedHardSkip({
    ...repairedBeforeCap,
    recommendation: cappedRecommendation,
  });

  if (hasRecommendationQualityContradiction(analysis)) {
    repairedAnalysis = {
      ...repairedAnalysis,
      recommendation: 'Apply ✅',
    };
  }

  return repairedAnalysis;
}
function getRecommendationType(recommendation) {
  if (String(recommendation ?? '').startsWith('Hard Skip')) return 'Hard Skip';
  if (String(recommendation ?? '').startsWith('Skip')) return 'Skip';
  if (String(recommendation ?? '').startsWith('Strong Apply')) return 'Strong Apply';
  if (String(recommendation ?? '').startsWith('Apply')) return 'Apply';
  return 'Skip';
}
function getReasoningSentenceLimit(recommendation) {
  const type = getRecommendationType(recommendation);

  if (type === 'Hard Skip') return 1;
  if (type === 'Skip') return 2;
  if (type === 'Apply') return 2;
  return 3;
}

function buildConsistentReasoning(analysis) {
  const recommendationType = getRecommendationType(analysis.recommendation);
  const hasExperienceGate = ['Hard Gap', 'Severe Gap'].includes(analysis.experienceGate);
  const hasEducationGate = ['Gap', 'Hard Gap', 'Severe Gap'].includes(analysis.educationGate);
  const hasLevelMismatch = ['Large', 'Severe'].includes(analysis.levelGap);
  const hasCriticalGaps = Array.isArray(analysis.criticalGaps) && analysis.criticalGaps.length > 0;
  const hasStrongMatches = Array.isArray(analysis.strongMatches) && analysis.strongMatches.length > 0;

  if (recommendationType === 'Hard Skip') {
    if (hasEducationGate) {
      return 'The role requires an advanced education credential that is not demonstrated by the resume.';
    }

    if (hasExperienceGate || hasLevelMismatch) {
      return 'This role requires significantly more experience and seniority than demonstrated by the resume.';
    }

    return 'The mismatch is too large to justify spending time on this application.';
  }

  if (recommendationType === 'Skip') {
    if (hasEducationGate) {
      return 'The role has a required education credential that is not demonstrated by the resume.';
    }

    if (hasExperienceGate || hasLevelMismatch) {
      return 'The role is above the resume’s demonstrated experience level. There are better opportunities to prioritize.';
    }

    return 'The technical overlap is limited and several core requirements are missing. There are better opportunities to prioritize.';
  }

  if (recommendationType === 'Apply') {
    if (hasEducationGate) {
      return 'Apply because the role has some overlap, but the required degree is not demonstrated by the resume.';
    }

    if (hasExperienceGate || hasLevelMismatch) {
      return 'Apply because the core stack has some overlap, but the experience level is the main concern.';
    }

    if (hasCriticalGaps) {
      return 'Apply because the role has useful overlap, but one core requirement creates a meaningful gap.';
    }

    return 'Apply because the expected return is not strong enough to prioritize.';
  }

  if (recommendationType === 'Strong Apply') {
    if (hasStrongMatches && !hasCriticalGaps) {
      return 'This role stands out because the resume aligns closely with the core work and shows unusually few decision-changing gaps.';
    }

    return 'This role stands out because the strongest parts of the resume map directly to the main work.';
  }

  if (hasStrongMatches && hasCriticalGaps) {
    return 'The main work is reasonably aligned, but one important gap keeps this from being a higher-priority application.';
  }

  return 'The role is worth a normal application because the core work appears reasonably aligned.';
}

function hasUxReasoningIssue(analysis) {
  const reasoning = String(analysis?.shortReasoning ?? '');
  const sentences = splitSentences(reasoning);
  const sentenceLimit = getReasoningSentenceLimit(analysis?.recommendation);

  return (
    sentences.length > sentenceLimit ||
    /\bfit score\b/i.test(reasoning) ||
    /\binterview chance\b/i.test(reasoning) ||
    /\bopportunity quality\b/i.test(reasoning) ||
    /\bcompany type\b/i.test(reasoning) ||
    /\bstrong matches include\b/i.test(reasoning) ||
    /\bcritical gaps include\b/i.test(reasoning)
  );
}

export function applyFinalConsistencyRepair(analysis, { resumeText, jobDescriptionText }) {
  const genericAnalysis = {
    ...analysis,
    shortReasoning: normalizePublicLanguage(analysis?.shortReasoning),
  };
  const recommendationConsistentAnalysis = repairRecommendationForConsistency(genericAnalysis);

  const stripInternalFields = (value) => {
    const {
      candidateLevel,
      jobLevel,
      levelGap,
      requiredExperienceYears,
      candidateExperienceYears,
      experienceGate,
      requiredEducationLevel,
      resumeEducationLevel,
      educationGate,
      recommendationCap,
      ...publicValue
    } = value;
    return publicValue;
  };

  const reasoningConsistentAnalysis =
    !hasFinalConsistencyIssue(recommendationConsistentAnalysis, { resumeText, jobDescriptionText }) &&
    !hasUxReasoningIssue(recommendationConsistentAnalysis)
      ? recommendationConsistentAnalysis
      : {
          ...recommendationConsistentAnalysis,
          shortReasoning: buildConsistentReasoning(recommendationConsistentAnalysis),
        };
  const finalRecommendationAnalysis = applyRecommendationHardRules(reasoningConsistentAnalysis);

  if (finalRecommendationAnalysis.recommendation !== reasoningConsistentAnalysis.recommendation) {
    return stripInternalFields({
      ...finalRecommendationAnalysis,
      shortReasoning: buildConsistentReasoning(finalRecommendationAnalysis),
    });
  }

  return stripInternalFields(finalRecommendationAnalysis);
}

export function recalibrateFitAfterPreferredGapRemoval(analysis) {
  if (
    analysis?.removedPreferredOnlyGapCount > 0 &&
    Array.isArray(analysis.criticalGaps) &&
    analysis.criticalGaps.length === 0 &&
    typeof analysis.fitScore === 'number'
  ) {
    const strongMatchCount = Array.isArray(analysis.strongMatches) ? analysis.strongMatches.length : 0;

    if (analysis.fitScore >= 7 && analysis.fitScore < 8) {
      return {
        ...analysis,
        fitScore: strongMatchCount >= 4 ? 8.5 : 8.0,
      };
    }

    if (analysis.fitScore < 7 && strongMatchCount >= 3) {
      return {
        ...analysis,
        fitScore: 6.5,
      };
    }

  }

  return analysis;
}

export function applyAnalysisGuardrails(analysis, { jobDescriptionText, resumeText }) {
  const withoutUnsupportedInferredGaps = removeUnsupportedInferredCriticalGaps(analysis, jobDescriptionText);
  const withoutPreferredOnlyGaps = removePreferredOnlyCriticalGaps(withoutUnsupportedInferredGaps, jobDescriptionText);
  const withRecalibratedFit = recalibrateFitAfterPreferredGapRemoval(withoutPreferredOnlyGaps);
  const withLevelGuardrails = applyCandidateJobLevelGuardrails(withRecalibratedFit, {
    resumeText,
    jobDescriptionText,
  });
  const withOpportunityQuality = applyOpportunityQualityGuardrails(withLevelGuardrails, jobDescriptionText);
  const withSanitizedReasoning = sanitizeUnsupportedReasoningSkills(withOpportunityQuality, resumeText);

  const { removedPreferredOnlyGapCount, ...publicAnalysis } = withSanitizedReasoning;
  return publicAnalysis;
}
