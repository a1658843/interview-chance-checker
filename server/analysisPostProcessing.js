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
      .filter((word) => word.length >= 4 && !['lack', 'lacks', 'missing', 'direct', 'experience'].includes(word)),
  );
}

function hasPreferredLanguage(sentence) {
  return /\b(preferred|nice[- ]to[- ]have|nice to have|bonus|plus|familiarity|exposure)\b/i.test(sentence);
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
  return /\b(entry[- ]level|associate|new grad|graduate|junior|0\s*-\s*2 years?|0-2 years?|junior candidates welcome|early career|will train|training provided|internships? count|academic projects? count|school projects? count|course projects? count)\b/i.test(
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
  if (candidateLevel === 'Junior' && jobLevel === 'Senior') return 'Borderline ⚠️';
  if (candidateLevel === 'Junior' && jobLevel === 'Mid') {
    return (requiredYears !== null && requiredYears >= 3) || productionOwnership ? 'Borderline ⚠️' : 'Apply ✅';
  }
  if (candidateLevel === 'Mid' && jobLevel === 'Staff') return 'Borderline ⚠️';
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
    return 'Borderline ⚠️';
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

export function applyCandidateJobLevelGuardrails(analysis, { resumeText, jobDescriptionText }) {
  const candidateLevel = inferCandidateLevel(resumeText);
  const jobLevel = inferJobLevel(jobDescriptionText);
  const levelGap = getLevelGap(candidateLevel, jobLevel);
  const requiredYears = getRequiredExperienceYears(jobDescriptionText);
  const candidateYears = getConservativeCandidateExperienceYears(resumeText, candidateLevel);
  const juniorFriendly = hasJuniorFriendlyLanguage(jobDescriptionText);
  const productionOwnership = hasStrongProductionOwnership(jobDescriptionText);
  const experienceGate = getExperienceGate(requiredYears, candidateYears, juniorFriendly);
  const experienceGateRecommendationCap = getExperienceGateRecommendationCap(experienceGate, requiredYears);
  const experienceGateInterviewChance = getExperienceGateInterviewChance(experienceGate);
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
      recommendationCap: experienceGateRecommendationCap ?? recommendationCap ?? guardedAnalysis.recommendationCap,
      criticalGaps: addCriticalGap(guardedAnalysis.criticalGaps, mismatchGap),
    };
  }

  if (experienceGateRecommendationCap || experienceGateInterviewChance) {
    guardedAnalysis = {
      ...guardedAnalysis,
      recommendationCap: experienceGateRecommendationCap ?? guardedAnalysis.recommendationCap,
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
  const companyType = analysis?.companyType ?? 'Unknown';

  if (
    companyType === 'Direct Employer' &&
    !hasClearRedFlag(jobDescriptionText) &&
    hasDetailedResponsibilities(jobDescriptionText) &&
    (hasProductOrBusinessContext(jobDescriptionText) || hasTeamOrRoleContext(jobDescriptionText))
  ) {
    return {
      ...analysis,
      opportunityQuality: 'High',
    };
  }

  if (companyType === 'Staffing Agency') {
    return {
      ...analysis,
      opportunityQuality: hasSpecificStaffingDetails(jobDescriptionText) ? 'Medium' : 'Low',
    };
  }

  return analysis;
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
      'borderline',
      'apply only if',
      'skip',
      'low expected return',
      'not worth',
    ].some((phrase) => reasoning.includes(phrase));
  }

  if (recommendation === 'Borderline ⚠️') {
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
    'Borderline ⚠️': 2,
    'Apply ✅': 3,
    'Strong Apply ✅': 4,
  };

  return ranks[recommendation] ?? 0;
}

function capRecommendation(recommendation, cap) {
  if (!cap) {
    return recommendation;
  }

  return getRecommendationRank(recommendation) > getRecommendationRank(cap) ? cap : recommendation;
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
      recommendationCap: repairedBeforeCap.recommendationCap ?? 'Borderline ⚠️',
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
      recommendationCap: repairedBeforeCap.recommendationCap ?? 'Borderline ⚠️',
      interviewChance: repairedBeforeCap.interviewChance === '<1%' ? '<1%' : '1-3%',
    };
  }

  const cappedRecommendation = capRecommendation(
    repairedBeforeCap?.recommendation,
    repairedBeforeCap?.recommendationCap,
  );
  let repairedAnalysis = {
    ...repairedBeforeCap,
    recommendation: cappedRecommendation,
  };

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
  if (String(recommendation ?? '').startsWith('Borderline')) return 'Borderline';
  if (String(recommendation ?? '').startsWith('Strong Apply')) return 'Strong Apply';
  if (String(recommendation ?? '').startsWith('Apply')) return 'Apply';
  return 'Skip';
}

function getReasoningSentenceLimit(recommendation) {
  const type = getRecommendationType(recommendation);

  if (type === 'Hard Skip') return 1;
  if (type === 'Skip') return 2;
  if (type === 'Borderline') return 2;
  return 3;
}

function buildConsistentReasoning(analysis) {
  const recommendationType = getRecommendationType(analysis.recommendation);
  const hasExperienceGate = ['Hard Gap', 'Severe Gap'].includes(analysis.experienceGate);
  const hasLevelMismatch = ['Large', 'Severe'].includes(analysis.levelGap);
  const hasCriticalGaps = Array.isArray(analysis.criticalGaps) && analysis.criticalGaps.length > 0;
  const hasStrongMatches = Array.isArray(analysis.strongMatches) && analysis.strongMatches.length > 0;

  if (recommendationType === 'Hard Skip') {
    if (hasExperienceGate || hasLevelMismatch) {
      return 'This role requires significantly more experience and seniority than demonstrated by the resume.';
    }

    return 'The mismatch is too large to justify spending time on this application.';
  }

  if (recommendationType === 'Skip') {
    if (hasExperienceGate || hasLevelMismatch) {
      return 'The role is above the resume’s demonstrated experience level. There are better opportunities to prioritize.';
    }

    return 'The technical overlap is limited and several core requirements are missing. There are better opportunities to prioritize.';
  }

  if (recommendationType === 'Borderline') {
    if (hasExperienceGate || hasLevelMismatch) {
      return 'The core stack has some overlap, but the experience level is the main concern.';
    }

    if (hasCriticalGaps) {
      return 'The role has plausible overlap, but one core requirement creates a meaningful gap.';
    }

    return 'The role is plausible, but the expected return is not strong enough to prioritize.';
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
      recommendationCap,
      ...publicValue
    } = value;
    return publicValue;
  };

  if (
    !hasFinalConsistencyIssue(recommendationConsistentAnalysis, { resumeText, jobDescriptionText }) &&
    !hasUxReasoningIssue(recommendationConsistentAnalysis)
  ) {
    return stripInternalFields(recommendationConsistentAnalysis);
  }

  return stripInternalFields({
    ...recommendationConsistentAnalysis,
    shortReasoning: buildConsistentReasoning(recommendationConsistentAnalysis),
  });
}

export function recalibrateFitAfterPreferredGapRemoval(analysis) {
  if (
    analysis?.removedPreferredOnlyGapCount > 0 &&
    Array.isArray(analysis.criticalGaps) &&
    analysis.criticalGaps.length === 0 &&
    typeof analysis.fitScore === 'number' &&
    analysis.fitScore >= 7 &&
    analysis.fitScore < 8
  ) {
    const strongMatchCount = Array.isArray(analysis.strongMatches) ? analysis.strongMatches.length : 0;

    return {
      ...analysis,
      fitScore: strongMatchCount >= 4 ? 8.5 : 8.0,
    };
  }

  return analysis;
}

export function applyAnalysisGuardrails(analysis, { jobDescriptionText, resumeText }) {
  const withoutPreferredOnlyGaps = removePreferredOnlyCriticalGaps(analysis, jobDescriptionText);
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
