import { isStrongMatchSupportedByResume, normalizeStrongMatches } from './strongMatches.js';
import { applyRoiStrategy, hasLowApplicationRoi } from './roiEvaluation.js';
import { isKnownLowRoiSource } from './knownLowRoiSources.js';

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
  return /\b(preferred|desired|nice[- ]to[- ]have|nice to have|bonus|bonus points?|plus|familiarity|exposure|knowledge of or interest in|interest in|technologies such as|ability to learn quickly|learn quickly|not candidates who already have experience with every technology)\b/i.test(sentence);
}

function hasExplicitPreferredLanguage(sentence) {
  return /\b(preferred|desired|nice[- ]to[- ]have|nice to have|bonus|bonus points?|plus|pluses?|extra credit)\b/i.test(sentence);
}

function hasRequiredLanguage(sentence) {
  return /\b(required|requirement|requirements|must have|must-have|minimum qualifications|qualifications|you have|need)\b/i.test(sentence);
}

function getRequirementHeadingLevel(line) {
  const heading = String(line ?? '')
    .trim()
    .replace(/^[-*•\s]+/, '')
    .replace(/[:：]\s*$/, '');

  if (
    /^(preferred qualifications?|preferred skills?|preferred|nice[- ]to[- ]have|nice to have|pluses?|bonus points?|desired skills?(?: and experience)?|desired|ideal candidate|certifications? preferred|preferred certifications?)$/i.test(
      heading,
    )
  ) {
    if (/bonus|pluses?/i.test(heading)) return 'bonus';
    if (/desired|ideal/i.test(heading)) return 'desired';
    return 'preferred';
  }

  if (
    /^(required qualifications?|required skills?(?:\s*(?:&|and)\s*qualifications?)?|requirements?|must haves?|minimum qualifications?|what you'?ll need|what you will need|qualifications?|what you bring|you have)$/i.test(
      heading,
    )
  ) {
    return 'required';
  }

  return null;
}

function splitHeadingAndRest(line) {
  const value = String(line ?? '').trim();
  const match = value.match(/^(.{2,80}?)(?::| - | – | — )\s*(.+)$/);

  if (!match) {
    return null;
  }

  const level = getRequirementHeadingLevel(match[1]);
  return level ? { level, rest: match[2].trim() } : null;
}

function getInlineRequirementLevel(sentence, sectionLevel) {
  if (/\b(bonus|bonus points?|pluses?|extra credit)\b/i.test(sentence)) {
    return 'bonus';
  }

  if (/\b(desired|ideal candidate)\b/i.test(sentence)) {
    return 'desired';
  }

  if (sectionLevel === 'required' && !hasExplicitPreferredLanguage(sentence)) {
    return 'required';
  }

  if (hasPreferredLanguage(sentence)) {
    return 'preferred';
  }

  if (['preferred', 'bonus', 'desired'].includes(sectionLevel)) {
    return sectionLevel;
  }

  if (hasRequiredLanguage(sentence)) {
    return 'required';
  }

  if (sectionLevel === 'required') {
    return 'required';
  }

  return 'unknown';
}

function parseJobRequirementSentences(jobDescriptionText) {
  const parsed = [];
  let sectionLevel = 'unknown';

  for (const rawLine of String(jobDescriptionText ?? '').split(/\r?\n/)) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine) {
      continue;
    }

    const headingAndRest = splitHeadingAndRest(trimmedLine);
    if (headingAndRest) {
      sectionLevel = headingAndRest.level;
      for (const sentence of splitSentences(headingAndRest.rest)) {
        parsed.push({
          sentence,
          level: getInlineRequirementLevel(sentence, sectionLevel),
        });
      }
      continue;
    }

    const isHeading =
      trimmedLine.length < 100 &&
      !/[.!?]$/.test(trimmedLine) &&
      getEducationLevelFromText(trimmedLine) === null;
    const headingLevel = isHeading ? getRequirementHeadingLevel(trimmedLine) : null;

    if (headingLevel) {
      sectionLevel = headingLevel;
      continue;
    }

    for (const sentence of splitSentences(trimmedLine)) {
      parsed.push({
        sentence,
        level: getInlineRequirementLevel(sentence, sectionLevel),
      });
    }
  }

  return parsed;
}

function sharesMeaningfulTerms(gap, sentence) {
  const gapMentionsMasters = /\bmaster'?s?|masters|m\.?\s*s\.?|m\.?\s*eng\.?\b/i.test(gap);
  const sentenceMentionsMasters = /\bmaster'?s?|masters|m\.?\s*s\.?|m\.?\s*eng\.?\b/i.test(sentence);
  const gapMentionsPhd = /\bph\.?\s*d\.?|doctorate|doctoral\b/i.test(gap);
  const sentenceMentionsPhd = /\bph\.?\s*d\.?|doctorate|doctoral\b/i.test(sentence);
  const gapMentionsBachelors = /\bbachelor'?s?|bachelors|b\.?\s*s\.?|b\.?\s*a\.?\b/i.test(gap);
  const sentenceMentionsBachelors = /\bbachelor'?s?|bachelors|b\.?\s*s\.?|b\.?\s*a\.?\b/i.test(sentence);

  if (gapMentionsMasters && sentenceMentionsMasters) {
    return true;
  }

  if (gapMentionsPhd && sentenceMentionsPhd) {
    return true;
  }

  if (gapMentionsBachelors && sentenceMentionsBachelors) {
    return true;
  }

  if (gapMentionsMasters || gapMentionsPhd || gapMentionsBachelors) {
    return false;
  }

  const gapWords = normalizedWords(gap);
  const sentenceWords = normalizedWords(sentence);
  let shared = 0;

  for (const word of gapWords) {
    if (sentenceWords.has(word)) {
      shared += 1;
    }
  }

  if (/\b(certification|certificate|certified)\b/i.test(gap)) {
    return shared >= 2;
  }

  return shared >= 1 || /\birt\b/i.test(gap) && /\birt\b/i.test(sentence);
}

export function isPreferredOnlyGap(gap, jobDescriptionText) {
  if (typeof gap !== 'string' || gap.trim().length === 0) {
    return false;
  }

  const requirementSentences = parseJobRequirementSentences(jobDescriptionText);
  const relatedPreferredSentences = requirementSentences.filter(
    ({ sentence, level }) =>
      ['preferred', 'desired', 'bonus'].includes(level) && sharesMeaningfulTerms(gap, sentence),
  );

  if (relatedPreferredSentences.length === 0) {
    return false;
  }

  const relatedRequiredSentences = requirementSentences.filter(
    ({ sentence, level }) => level === 'required' && sharesMeaningfulTerms(gap, sentence),
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
    return (requiredYears === null || requiredYears < 3) && !['Senior', 'Staff'].includes(inferJobLevel(jobDescriptionText));
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

function isProjectTaskPlatform(jobDescriptionText) {
  const text = String(jobDescriptionText ?? '');
  const signals = [
    /\bafterquery\b/i,
    /\bproject[- ]based\b/i,
    /\btask[- ]style\b/i,
    /\btasks?\s+(?:are\s+)?assigned\s+project[- ]by[- ]project\b/i,
    /\bproject[- ]by[- ]project\b/i,
    /\b10\s*(?:-|–|—|to)\s*20\s*hours?\s*\/?\s*week\b/i,
    /\b2\s*(?:-|–|—|to)\s*3\s*weeks?\b/i,
    /\bvariety of stacks\b/i,
    /\bportfolio building\b/i,
    /\bsupports?\s+ai labs?\b/i,
    /\bresearch lab\b/i,
    /\breal[- ]world engineering problems\b/i,
  ];

  return signals.filter((signal) => signal.test(text)).length >= 2;
}

function extractLinkedInCompanyMetadata(jobDescriptionText) {
  const companyMatch = String(jobDescriptionText ?? '').match(/^\s*Company\s*:\s*(.+)$/im);
  return companyMatch ? cleanPostingSource(companyMatch[1]) : '';
}

function isKnownStaffingSourceName(value) {
  return /\b(robert half|motion recruitment|dice|crossing hurdles|quik hire staffing|hire feed|akkodis|teksystems|randstad|insight global|kforce|experis|collabera|judge group|net2source|talentburst|apex systems)\b/i.test(
    String(value ?? ''),
  );
}

function hasStrongStaffingSignal(jobDescriptionText) {
  const text = String(jobDescriptionText ?? '');

  return (
    /\b(crossing hurdles|dice[- ]style recruiter|recruiting firm|recruiting agency|staffing agency|staffing partner|staffing firm|contract placement|placement firm|posting for a client|client is seeking|our client|one of our clients|work for one of our clients|unknown end client|end client)\b/i.test(
      text,
    ) ||
    /\brecruiter posting\b[\s\S]{0,120}\bclient\b/i.test(text) ||
    /\brecruiter\b[\s\S]{0,120}\bposting for a client\b/i.test(text) ||
    isKnownStaffingSourceName(extractLinkedInCompanyMetadata(text))
  );
}

function hasDirectEmployerLinkedInMetadata(jobDescriptionText) {
  const text = String(jobDescriptionText ?? '');
  const company = extractLinkedInCompanyMetadata(text);

  return (
    company.length > 0 &&
    /^\s*LinkedIn Job Posting\b/im.test(text) &&
    !isKnownLowRoiSource(company) &&
    !isKnownStaffingSourceName(company)
  );
}

function classifyEmployerType(jobDescriptionText) {
  const text = String(jobDescriptionText ?? '');

  if (
    /\b(stealth startup|confidential company|no company identity|company confidential|unrealistic compensation|minimal company information|generic responsibilities)\b/i.test(
      text,
    )
  ) {
    return 'Suspicious Posting';
  }

  if (hasStrongStaffingSignal(text)) {
    return 'Staffing Agency';
  }

  if (
    /\b(talent network|talent community|join our network|future opportunities|matching platform|candidate marketplace|talent pool|build your profile|create candidate account|future matching opportunities|workerbee)\b/i.test(
      text,
    )
    || isProjectTaskPlatform(text)
  ) {
    return 'Talent Network';
  }

  if (hasDirectEmployerLinkedInMetadata(text)) {
    return 'Direct Employer';
  }

  return null;
}

function cleanPostingSource(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:|\-–—]+|[\s:|\-–—]+$/g, '')
    .trim();
}

function isLinkedInChromeLine(value) {
  return /^(share|show more options|save|follow|view job|apply|easy apply|promoted|reposted|actively hiring|see who .* hired|similar jobs|show more|show less)$/i.test(
    cleanPostingSource(value),
  );
}

function looksLikePostingSource(value) {
  const source = cleanPostingSource(value);

  return (
    source.length >= 2 &&
    source.length <= 60 &&
    !isLinkedInChromeLine(source) &&
    !/\b(remote|hybrid|onsite|full[- ]time|part[- ]time|contract|internship|applicants?|ago|reposted|promoted|easy apply|followers?|employees?)\b/i.test(
      source,
    ) &&
    /[a-z]/i.test(source)
  );
}

function extractPostingSource(jobDescriptionText) {
  const lines = String(jobDescriptionText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 18)) {
    const labeledMatch = line.match(
      /^(?:posting\s+source|source|company|employer|posted\s+by|hiring\s+company|recruiter|agency)\s*[:\-–—]\s*(.+)$/i,
    );

    if (labeledMatch && looksLikePostingSource(labeledMatch[1])) {
      return cleanPostingSource(labeledMatch[1]);
    }
  }

  const titleLikeHeadings = [
    /\b(software|engineer|developer|frontend|backend|full[- ]stack|data|product|manager|analyst|consultant|specialist|architect|designer|intern)\b/i,
    /\b(job|role|position|description|about|overview|requirements?|qualifications?)\b/i,
  ];

  for (const line of lines.slice(0, 20)) {
    if (
      looksLikePostingSource(line) &&
      line.split(/\s+/).length <= 4 &&
      !/[.!?]$/.test(line) &&
      !/\b(is hiring|hiring for|is seeking|seeking a|seeking an|looking for)\b/i.test(line) &&
      !titleLikeHeadings.some((pattern) => pattern.test(line)) &&
      isKnownLowRoiSource(line)
    ) {
      return cleanPostingSource(line);
    }
  }

  for (const line of lines.slice(0, 8)) {
    if (
      looksLikePostingSource(line) &&
      line.split(/\s+/).length <= 5 &&
      !/[.!?]$/.test(line) &&
      !/\b(is hiring|hiring for|is seeking|seeking a|seeking an|looking for)\b/i.test(line) &&
      !titleLikeHeadings.some((pattern) => pattern.test(line))
    ) {
      return cleanPostingSource(line);
    }
  }

  return undefined;
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

  for (const { sentence, level: requirementLevel } of parseJobRequirementSentences(jobDescriptionText)) {
    if (requirementLevel !== 'required' && !hasEducationRequirementContext(sentence)) {
      continue;
    }

    if (requirementLevel !== 'required') {
      continue;
    }

    const level = getEducationLevelFromText(sentence);
    if (level !== null) {
      levels.push(level);
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

    const sentenceWithoutRanges = sentence.replace(
      /\b(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\+?\s*years?\b/gi,
      (_, lower) => {
        years.push(Number(lower));
        return ' ';
      },
    );

    for (const match of sentenceWithoutRanges.matchAll(/\b(?:at least|minimum of|minimum|required)?\s*(\d{1,2})\+?\s*(?:\+|plus)?\s*years?\b/gi)) {
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
  const postingSource = analysis?.postingSource ?? extractPostingSource(jobDescriptionText);

  if (companyType === 'Talent Network') {
    return {
      ...analysis,
      companyType,
      postingSource,
      opportunityQuality: 'Medium',
      interviewChance: capInterviewChance(analysis?.interviewChance, '3-7%'),
    };
  }

  if (companyType === 'Suspicious Posting') {
    return {
      ...analysis,
      companyType,
      postingSource,
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
      postingSource,
      opportunityQuality: 'High',
    };
  }

  if (companyType === 'Staffing Agency') {
    return {
      ...analysis,
      companyType,
      postingSource,
      opportunityQuality: hasSpecificStaffingDetails(jobDescriptionText) ? 'Medium' : 'Low',
      interviewChance: capInterviewChance(analysis?.interviewChance, '5-10%'),
    };
  }

  return {
    ...analysis,
    companyType,
    postingSource,
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
    return ['top priority', 'must apply', 'highest priority', 'strong apply', 'apply normally', 'apply because'].some(
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

function getEmployerTypeReasoningSentence(analysis) {
  if (analysis?.companyType === 'Staffing Agency') {
    return 'The staffing/recruiting layer lowers conversion odds because the resume usually has to pass an agency screen before reaching the client.';
  }

  if (analysis?.companyType === 'Talent Network') {
    return 'The candidate pool or marketplace model lowers conversion odds because matching to a real hiring-manager screen is an extra step.';
  }

  if (analysis?.companyType === 'Suspicious Posting') {
    return 'Posting quality and credibility concerns lower expected conversion even if the technical fit is usable.';
  }

  return '';
}

function hasEmployerTypeReasoning(analysis) {
  const reasoning = String(analysis?.shortReasoning ?? '').toLowerCase();

  if (analysis?.companyType === 'Staffing Agency') {
    return /\b(staffing|recruiting|recruiter|agency|client)\b/i.test(reasoning);
  }

  if (analysis?.companyType === 'Talent Network') {
    return /\b(candidate pool|talent pool|marketplace|matching|talent network|hiring-manager screen)\b/i.test(reasoning);
  }

  if (analysis?.companyType === 'Suspicious Posting') {
    return /\b(posting quality|credibility|suspicious|stealth|low[- ]quality|unclear posting)\b/i.test(reasoning);
  }

  return true;
}

function missingEmployerTypeReasoning(analysis) {
  return (
    ['Staffing Agency', 'Talent Network', 'Suspicious Posting'].includes(analysis?.companyType) &&
    !hasEmployerTypeReasoning(analysis)
  );
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
    missingEmployerTypeReasoning(analysis) ||
    hasLevelMismatchScoreContradiction(analysis) ||
    hasLevelMismatchRecommendationContradiction(analysis) ||
    hasLevelMismatchReasoningIssue(analysis) ||
    hasExperienceGateReasoningIssue(analysis) ||
    hasEducationGateReasoningIssue(analysis) ||
    hasUnsupportedPositiveYearsClaim(analysis, { resumeText, jobDescriptionText }) ||
    (
      analysis?.optimizeForApplicationRoi &&
      getRecommendationType(analysis?.recommendation) === 'Skip' &&
      hasLowApplicationRoi(analysis) &&
      !/\b(expected return|return on application time|application roi)\b/i.test(
        String(analysis?.shortReasoning ?? ''),
      )
    ) ||
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

function getCriticalGapTexts(analysis) {
  return Array.isArray(analysis?.criticalGaps) ? analysis.criticalGaps : [];
}

function isDecisionChangingRequiredGap(gap) {
  const value = String(gap ?? '');

  return /\b(required|mandatory|must[- ]have|core|central|production|deployment|cloud|aws|azure|gcp|node\.?js|backend|frontend|domain|platform|java|ios|swift|android|kotlin|salesforce|servicenow|sap|camunda|flowable|bpmn|edi|security clearance|sass|less|state management)\b/i.test(
    value,
  );
}

function hasEvidenceBackedMismatchReasoning(analysis) {
  const reasoning = String(analysis?.shortReasoning ?? '');

  if (
    !/\b(major mismatch|significant mismatch|not worth prioritizing|too large to justify)\b/i.test(
      reasoning,
    )
  ) {
    return false;
  }

  const criticalGaps = getCriticalGapTexts(analysis);
  return criticalGaps.some(isDecisionChangingRequiredGap) || criticalGaps.length >= 2;
}

function normalizeRecommendationWithEvidenceConsistency(analysis) {
  const recommendationType = getRecommendationType(analysis?.recommendation);
  const criticalGaps = getCriticalGapTexts(analysis);
  const decisionChangingGapCount = criticalGaps.filter(isDecisionChangingRequiredGap).length;
  const strongMatchCount = getStrongMatchCount(analysis);

  if (recommendationType === 'Strong Apply') {
    if (decisionChangingGapCount > 0 || hasEvidenceBackedMismatchReasoning(analysis)) {
      return {
        ...analysis,
        recommendation: 'Apply \u2705',
      };
    }
  }

  if (recommendationType === 'Apply') {
    if (
      (decisionChangingGapCount >= 2 && strongMatchCount <= 2) ||
      hasEvidenceBackedMismatchReasoning(analysis)
    ) {
      return {
        ...analysis,
        recommendation: 'Skip \u274c',
      };
    }
  }

  return analysis;
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

function withEmployerTypeReasoning(reasoning, analysis) {
  const employerSentence = getEmployerTypeReasoningSentence(analysis);
  return employerSentence ? `${reasoning} ${employerSentence}` : reasoning;
}

function getDecisionPriority(analysis) {
  const criticalGapText = Array.isArray(analysis?.criticalGaps) ? analysis.criticalGaps.join(' ') : '';

  if (
    ['Hard Gap', 'Severe Gap'].includes(analysis?.experienceGate) ||
    ['Large', 'Severe'].includes(analysis?.levelGap) ||
    /\b\d+\+?\s*years?\b/i.test(criticalGapText) ||
    /\bexperience[- ]level mismatch|seniority mismatch|staff|principal|lead\b/i.test(criticalGapText)
  ) {
    return 'P0_EXPERIENCE';
  }

  if (/\b(clearance|citizenship|visa|sponsorship|onsite|on-site|hybrid|relocation)\b/i.test(criticalGapText)) {
    return 'P0_HARD_BLOCKER';
  }

  if (['Gap', 'Hard Gap', 'Severe Gap'].includes(analysis?.educationGate)) {
    return 'P1_EDUCATION';
  }

  if (/\b(required|primary|core|language|framework|platform|domain|cloud|aws|azure|gcp|java|python|react|node|kubernetes)\b/i.test(criticalGapText)) {
    return 'P1_REQUIRED_SKILL';
  }

  return 'P2_GENERAL';
}

function buildConsistentReasoning(analysis) {
  const recommendationType = getRecommendationType(analysis.recommendation);
  const decisionPriority = getDecisionPriority(analysis);
  const hasExperienceGate = ['Hard Gap', 'Severe Gap'].includes(analysis.experienceGate);
  const hasEducationGate = ['Gap', 'Hard Gap', 'Severe Gap'].includes(analysis.educationGate);
  const hasLevelMismatch = ['Large', 'Severe'].includes(analysis.levelGap);
  const hasCriticalGaps = Array.isArray(analysis.criticalGaps) && analysis.criticalGaps.length > 0;
  const hasStrongMatches = Array.isArray(analysis.strongMatches) && analysis.strongMatches.length > 0;

  if (recommendationType === 'Hard Skip') {
    if (decisionPriority === 'P0_EXPERIENCE' || hasExperienceGate || hasLevelMismatch) {
      return 'This role requires significantly more experience and seniority than demonstrated by the resume.';
    }

    if (decisionPriority === 'P1_EDUCATION' || hasEducationGate) {
      return 'The role requires an advanced education credential that is not demonstrated by the resume.';
    }

    return 'The mismatch is too large to justify spending time on this application.';
  }

  if (recommendationType === 'Skip') {
    if (analysis?.optimizeForApplicationRoi && hasLowApplicationRoi(analysis)) {
      if (analysis?.companyType === 'Talent Network') {
        return 'The technical fit is plausible, but the talent marketplace or project-task model lowers expected return on application time.';
      }

      return 'The technical fit is plausible, but the expected return on application time is low for this posting.';
    }

    if (decisionPriority === 'P0_EXPERIENCE' || hasExperienceGate || hasLevelMismatch) {
      return 'The role is above the resume’s demonstrated experience level. There are better opportunities to prioritize.';
    }

    if (hasEducationGate) {
      return 'The role has a required education credential that is not demonstrated by the resume.';
    }

    if (hasExperienceGate || hasLevelMismatch) {
      return 'The role is above the resume’s demonstrated experience level. There are better opportunities to prioritize.';
    }

    return 'The technical overlap is limited and several core requirements are missing. There are better opportunities to prioritize.';
  }

  if (recommendationType === 'Apply') {
    if (decisionPriority === 'P0_EXPERIENCE' || hasExperienceGate || hasLevelMismatch) {
      return withEmployerTypeReasoning(
        'Apply because the core stack has some overlap, but the experience level is the main concern.',
        analysis,
      );
    }

    if (hasEducationGate) {
      return withEmployerTypeReasoning(
        'Apply because the role has some overlap, but the required degree is not demonstrated by the resume.',
        analysis,
      );
    }

    if (hasExperienceGate || hasLevelMismatch) {
      return withEmployerTypeReasoning(
        'Apply because the core stack has some overlap, but the experience level is the main concern.',
        analysis,
      );
    }

    if (hasCriticalGaps) {
      return withEmployerTypeReasoning(
        'Apply because the role has useful overlap, but one core requirement creates a meaningful gap.',
        analysis,
      );
    }

    return withEmployerTypeReasoning(
      'Apply because the expected return is not strong enough to prioritize.',
      analysis,
    );
  }

  if (recommendationType === 'Strong Apply') {
    if (hasStrongMatches && !hasCriticalGaps) {
      return withEmployerTypeReasoning(
        'This role stands out because the resume aligns closely with the core work and shows unusually few decision-changing gaps.',
        analysis,
      );
    }

    return withEmployerTypeReasoning(
      'This role stands out because the strongest parts of the resume map directly to the main work.',
      analysis,
    );
  }

  if (hasStrongMatches && hasCriticalGaps) {
    return withEmployerTypeReasoning(
      'The main work is reasonably aligned, but one important gap keeps this from being a higher-priority application.',
      analysis,
    );
  }

  return withEmployerTypeReasoning(
    'The role is worth a normal application because the core work appears reasonably aligned.',
    analysis,
  );
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

const interviewChanceRanges = ['<1%', '1-3%', '3-7%', '5-10%', '8-15%', '15-25%', '25%+'];

function getInterviewChanceRank(interviewChance) {
  const normalizedChance = interviewChanceRanges.find((range) => range === interviewChance);
  if (normalizedChance) {
    return interviewChanceRanges.indexOf(normalizedChance);
  }

  const upperBound = getInterviewChanceUpperBound(interviewChance);
  if (upperBound === null) return 2;
  if (upperBound <= 1) return 0;
  if (upperBound <= 3) return 1;
  if (upperBound <= 7) return 2;
  if (upperBound <= 10) return 3;
  if (upperBound <= 15) return 4;
  if (upperBound <= 25) return 5;
  return 6;
}

function minInterviewChance(...chances) {
  const normalized = chances.filter(Boolean);
  if (normalized.length === 0) {
    return '3-7%';
  }

  return normalized.sort((a, b) => getInterviewChanceRank(a) - getInterviewChanceRank(b))[0];
}

function hasVeryHighCompetitionSignals(jobDescriptionText) {
  const text = String(jobDescriptionText ?? '');
  const hasRemote = /\b(remote|fully remote|100%\s*remote|work from home)\b/i.test(text);
  const hasEasyApply = /\beasy apply\b/i.test(text);
  const applicantCount = Array.from(text.matchAll(/\b(\d{2,4})\+?\s+applicants?\b/gi)).map((match) =>
    Number(match[1]),
  );

  return (hasRemote && hasEasyApply) || applicantCount.some((count) => count >= 100);
}

function getDeterministicInterviewChance(analysis, jobDescriptionText) {
  const score = Number(analysis?.fitScore ?? 0);
  const companyType = analysis?.companyType ?? 'Unknown';
  const opportunityQuality = analysis?.opportunityQuality ?? 'Medium';
  const effortLevel = analysis?.effortLevel ?? 'Low';
  const applicationRequirements = Array.isArray(analysis?.applicationRequirements)
    ? analysis.applicationRequirements
    : [];
  const hasHeavyApplicationEffort =
    effortLevel === 'Very High' ||
    applicationRequirements.includes('AI Interview Required') ||
    applicationRequirements.includes('Multi-hour Assessment Required') ||
    (applicationRequirements.includes('Coding Challenge Required') &&
      applicationRequirements.includes('Video Submission Required'));

  if (analysis?.experienceGate === 'Severe Gap' || analysis?.levelGap === 'Severe' || analysis?.educationGate === 'Severe Gap') {
    return '<1%';
  }

  if (analysis?.experienceGate === 'Hard Gap' || analysis?.educationGate === 'Hard Gap') {
    return '1-3%';
  }

  let chance;

  if (score >= 9) {
    chance = opportunityQuality === 'High' && companyType === 'Direct Employer' ? '15-25%' : '8-15%';
  } else if (score >= 8) {
    chance = opportunityQuality === 'High' && companyType === 'Direct Employer' ? '8-15%' : '5-10%';
  } else if (score >= 7) {
    chance = opportunityQuality === 'High' && companyType === 'Direct Employer' ? '8-15%' : '3-7%';
  } else if (score >= 6) {
    chance = opportunityQuality === 'High' && companyType === 'Direct Employer' ? '3-7%' : '1-3%';
  } else if (score >= 4) {
    chance = '1-3%';
  } else {
    chance = '1-3%';
  }

  const caps = [];

  if (companyType === 'Staffing Agency') caps.push('5-10%');
  if (companyType === 'Talent Network' || companyType === 'Suspicious Posting') caps.push('3-7%');
  if (opportunityQuality === 'Low') caps.push('5-10%');
  if (hasVeryHighCompetitionSignals(jobDescriptionText)) caps.push('3-7%');
  if (hasHeavyApplicationEffort && score < 9) caps.push('5-10%');

  return minInterviewChance(chance, ...caps);
}

function getDeterministicFitScore(analysis) {
  const score = Number(analysis?.fitScore ?? 0);

  if (analysis?.educationGate === 'Severe Gap') {
    return 2.0;
  }

  if (analysis?.experienceGate === 'Severe Gap' && analysis?.levelGap === 'Severe') {
    return 2.5;
  }

  if (analysis?.experienceGate === 'Severe Gap') {
    return 3.0;
  }

  if (analysis?.levelGap === 'Severe') {
    return 3.5;
  }

  return Number.isFinite(score) ? score : 0;
}

function getStableDisplayedFitScore(analysis) {
  const score = Number(analysis?.fitScore ?? 0);
  if (!Number.isFinite(score)) {
    return 0;
  }

  if (
    analysis?.educationGate === 'Severe Gap' ||
    analysis?.experienceGate === 'Severe Gap' ||
    analysis?.levelGap === 'Severe'
  ) {
    return Number(score.toFixed(1));
  }

  const criticalGaps = getCriticalGapTexts(analysis);
  const strongMatchCount = getStrongMatchCount(analysis);
  const decisionChangingGapCount = criticalGaps.filter(isDecisionChangingRequiredGap).length;
  const hasUnmetExperienceRequirement = criticalGaps.some((gap) =>
    /\b\d+\+?\s*years?\b.*\b(experience|requirement)\b.*\bnot met\b/i.test(String(gap ?? '')),
  );

  if (
    analysis?.experienceGate === 'Hard Gap' &&
    hasUnmetExperienceRequirement &&
    decisionChangingGapCount >= 3 &&
    strongMatchCount <= 1 &&
    score >= 2 &&
    score <= 5 &&
    analysis?.recommendation === 'Skip ❌' &&
    analysis?.interviewChance === '1-3%'
  ) {
    return 3.0;
  }

  if (decisionChangingGapCount >= 2 && score >= 9) {
    return 8.0;
  }

  if (criticalGaps.some(isDeterministicRequiredSkillGap) && score >= 7.5 && score < 9) {
    return 8.0;
  }

  if (criticalGaps.length === 0 && strongMatchCount >= 2 && score >= 7.5 && score < 9) {
    return 8.5;
  }

  return Number(score.toFixed(1));
}

function getEvidenceStabilizedFitScore(analysis) {
  const score = Number(analysis?.fitScore ?? 0);

  if (!Number.isFinite(score)) {
    return 0;
  }

  const criticalGaps = getCriticalGapTexts(analysis);

  if (criticalGaps.some(isDeterministicRequiredSkillGap) && score >= 7.5 && score < 9) {
    return 8.0;
  }

  return Number(score.toFixed(1));
}

function getDeterministicRecommendation(analysis) {
  const score = Number(analysis?.fitScore ?? 0);
  let recommendation;

  if (analysis?.experienceGate === 'Severe Gap' || analysis?.levelGap === 'Severe' || analysis?.educationGate === 'Severe Gap') {
    recommendation = hasExtremeMismatchForHardSkip(analysis) ? 'Hard Skip \u274c\u274c' : 'Skip \u274c';
  } else if (
    analysis?.experienceGate === 'Hard Gap' ||
    analysis?.educationGate === 'Hard Gap' ||
    hasBlockingExperienceMismatchForRecommendation(analysis)
  ) {
    recommendation = 'Skip \u274c';
  } else if (score <= 3.5) {
    recommendation = hasExtremeMismatchForHardSkip(analysis) ? 'Hard Skip \u274c\u274c' : 'Skip \u274c';
  } else if (score >= 8) {
    recommendation = 'Strong Apply \u2705';
  } else if (score >= 6) {
    recommendation = 'Apply \u2705';
  } else {
    recommendation = 'Skip \u274c';
  }

  return capRecommendation(recommendation, analysis?.recommendationCap);
}

function normalizeStringList(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const item of items) {
    const value = typeof item === 'string' ? item.trim() : '';
    const key = value.toLowerCase();

    if (!value || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(value);
  }

  return normalized;
}

function getCriticalGapPriority(gap) {
  if (/\d+\+?\s*years?|experience requirement|experience-level|seniority/i.test(gap)) return 0;
  if (/degree|education|phd|master|bachelor/i.test(gap)) return 1;
  if (/security clearance|clearance|citizen/i.test(gap)) return 2;
  return 3;
}

const sassLessCriticalGap = 'SASS or LESS experience not demonstrated';
const stateManagementCriticalGap = 'State management libraries (Redux, Context API) experience not demonstrated';
const distributedSystemsCriticalGap = 'Distributed systems and data-heavy platform experience missing';

function isSassLessCriticalGap(gap) {
  const value = String(gap ?? '').toLowerCase();
  const mentionsSassLess = /\bsass\b|\bscss\b|\bsass\s*\/\s*less\b|\bsass\s+or\s+less\b/i.test(value);
  const mentionsLessAsCss = /\bless\b/i.test(value) && /\b(css|sass|scss|preprocessors?)\b/i.test(value);
  const mentionsCssPreprocessor = /\bcss\s+preprocessors?\b/i.test(value);

  return mentionsSassLess || mentionsLessAsCss || mentionsCssPreprocessor;
}

function isStateManagementCriticalGap(gap) {
  const value = String(gap ?? '').toLowerCase();

  return /\bstate management\b|\bredux\b|\bcontext api\b|\breact context\b/i.test(value);
}

function isDistributedSystemsCriticalGap(gap) {
  const value = String(gap ?? '').toLowerCase();

  return (
    /\bdistributed systems?\b/i.test(value) ||
    /\bdata[- ]heavy platforms?\b/i.test(value) ||
    /\blarge[- ]scale backend systems?\b/i.test(value) ||
    /\bhigh[- ]throughput distributed systems?\b/i.test(value) ||
    /\bhigh[- ]throughput distributed workflows?\b/i.test(value) ||
    /\blow[- ]latency distributed workflows?\b/i.test(value) ||
    /\bresilient distributed pipelines?\b/i.test(value) ||
    /\bproduction[- ]scale distributed platforms?\b/i.test(value)
  );
}

function canonicalizeCriticalGapDisplay(gap) {
  if (isSassLessCriticalGap(gap)) {
    return sassLessCriticalGap;
  }

  if (isStateManagementCriticalGap(gap)) {
    return stateManagementCriticalGap;
  }

  if (isDistributedSystemsCriticalGap(gap)) {
    return distributedSystemsCriticalGap;
  }

  return gap;
}

function getCriticalGapSemanticKey(gap) {
  const canonicalGap = canonicalizeCriticalGapDisplay(gap);
  const value = String(canonicalGap ?? '').toLowerCase();

  if (canonicalGap === sassLessCriticalGap) {
    return 'sass-less';
  }

  if (canonicalGap === stateManagementCriticalGap) {
    return 'state-management';
  }

  if (canonicalGap === distributedSystemsCriticalGap) {
    return 'distributed-systems';
  }

  if (/\b(major|severe|moderate)?\s*experience[- ]level mismatch|seniority mismatch|level mismatch\b/i.test(value)) {
    return 'experience-level';
  }

  const yearsMatch = value.match(/\b(\d{1,2})\+?\s*(?:\+|plus)?\s*years?\b/i);
  if (yearsMatch && /\b(experience|professional|software|engineering|development|developer)\b/i.test(value)) {
    return `years-${yearsMatch[1]}`;
  }

  return value
    .replace(/\b(no|lack of|lacks|missing|required|requirement not met|not met|experience|professional|software|engineering|development|developer|of|with|in|the|and)\b/gi, ' ')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isExperienceGapKey(key) {
  return key === 'experience-level' || /^years-\d+$/.test(key);
}

function getCriticalGapClarityScore(gap) {
  const value = String(gap ?? '');
  let score = 0;

  if (/requirement not met/i.test(value)) score += 15;
  if (/\d+\+?\s*years?/i.test(value)) score += 10;
  if (/experience[- ]level mismatch/i.test(value)) score += 8;
  if (/^(Major|Severe|Moderate) experience[- ]level mismatch$/i.test(value)) score += 8;
  score -= Math.max(0, value.length - 55) / 10;

  return score;
}

function chooseClearerCriticalGap(current, next) {
  return getCriticalGapClarityScore(next) > getCriticalGapClarityScore(current) ? next : current;
}

function dedupeCriticalGapsByMeaning(gaps) {
  const normalized = normalizeStringList(normalizeStringList(gaps).map(canonicalizeCriticalGapDisplay));
  const byKey = new Map();

  for (const gap of normalized) {
    const semanticKey = getCriticalGapSemanticKey(gap);
    const key = isExperienceGapKey(semanticKey) ? 'experience-gap' : semanticKey;

    if (!key) {
      continue;
    }

    byKey.set(key, byKey.has(key) ? chooseClearerCriticalGap(byKey.get(key), gap) : gap);
  }

  return [...byKey.values()];
}

function sortCriticalGaps(gaps) {
  return dedupeCriticalGapsByMeaning(gaps).sort((a, b) => {
    const priorityDifference = getCriticalGapPriority(a) - getCriticalGapPriority(b);
    return priorityDifference === 0 ? a.localeCompare(b) : priorityDifference;
  });
}

function isRequiredBackedCriticalGap(gap, jobDescriptionText) {
  const value = String(gap ?? '');

  if (hasPreferredLanguage(value)) {
    return false;
  }

  if (/\b\d+\+?\s*years?\b/i.test(value)) {
    const requiredYears = getRequiredExperienceYears(jobDescriptionText);
    const gapYears = getYearsMentionedInGap(value);
    return requiredYears !== null && gapYears.includes(requiredYears);
  }

  if (/\bexperience[- ]level mismatch|seniority mismatch|level mismatch\b/i.test(value)) {
    const requiredYears = getRequiredExperienceYears(jobDescriptionText);
    return (requiredYears !== null && requiredYears >= 3) || ['Senior', 'Staff'].includes(inferJobLevel(jobDescriptionText));
  }

  const requirementSentences = parseJobRequirementSentences(jobDescriptionText);
  return requirementSentences.some(
    ({ sentence, level }) => level === 'required' && sharesMeaningfulTerms(value, sentence),
  );
}

function normalizeSkillText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/node\.js/g, 'nodejs')
    .replace(/vue\.js/g, 'vuejs')
    .replace(/react\.js/g, 'reactjs')
    .replace(/context\s+api/g, 'contextapi')
    .replace(/react\s+context/g, 'reactcontext')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasSkillPhrase(text, phrase) {
  const normalizedText = normalizeSkillText(text);
  const normalizedPhrase = normalizeSkillText(phrase);

  if (!normalizedText || !normalizedPhrase) {
    return false;
  }

  return new RegExp(`(^| )${normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(
    normalizedText,
  );
}

const deterministicRequiredSkillGapCatalog = [
  {
    canonicalGap: sassLessCriticalGap,
    jobSignals: ['sass', 'scss', 'less', 'css preprocessor', 'css preprocessors'],
    resumeSignals: ['sass', 'scss', 'less', 'css preprocessor', 'css preprocessors'],
  },
  {
    canonicalGap: stateManagementCriticalGap,
    jobSignals: [
      'state management',
      'state management libraries',
      'redux',
      'context api',
      'react context',
      'zustand',
      'mobx',
    ],
    resumeSignals: ['redux', 'context api', 'react context', 'zustand', 'mobx', 'state management'],
  },
  {
    canonicalGap: distributedSystemsCriticalGap,
    jobSignals: [
      'distributed systems',
      'data heavy platforms',
      'data heavy platform',
      'large scale backend systems',
      'large scale backend system',
      'high throughput distributed workflows',
      'high throughput distributed workflow',
      'low latency distributed workflows',
      'low latency distributed workflow',
      'resilient distributed pipelines',
      'resilient distributed pipeline',
      'production scale distributed platform',
      'production scale distributed platforms',
    ],
    resumeSignals: [
      'distributed systems',
      'distributed architecture',
      'large scale backend systems',
      'large scale backend system',
      'high throughput systems',
      'high throughput system',
      'low latency systems',
      'low latency system',
      'large scale platform',
      'large scale platforms',
      'resilient distributed workflows',
      'resilient distributed workflow',
      'production scale distributed platform',
      'production scale distributed platforms',
      'distributed data platform ownership',
    ],
  },
];

function isDeterministicRequiredSkillGap(gap) {
  return deterministicRequiredSkillGapCatalog.some(({ canonicalGap }) => canonicalGap === gap);
}

function isExplicitSkillRequirementSentence(sentence, level) {
  if (level === 'required') {
    return true;
  }

  if (level !== 'unknown') {
    return false;
  }

  return /\b(requirements?|required|must(?: have)?|need(?:ed)?|proficien(?:t|cy)|experience with|skills? include|tech stack|stack includes|using|with)\b/i.test(
    sentence,
  );
}

function getDeterministicRequiredSkillGaps(resumeText, jobDescriptionText) {
  const requirementSentences = parseJobRequirementSentences(jobDescriptionText).filter(
    ({ sentence, level }) =>
      !['preferred', 'desired', 'bonus'].includes(level) &&
      (level === 'required' || !hasPreferredLanguage(sentence)) &&
      isExplicitSkillRequirementSentence(sentence, level),
  );

  const gaps = [];

  for (const { canonicalGap, jobSignals, resumeSignals } of deterministicRequiredSkillGapCatalog) {
    const isRequiredByJob = requirementSentences.some(({ sentence }) =>
      jobSignals.some((signal) => hasSkillPhrase(sentence, signal)),
    );

    if (!isRequiredByJob) {
      continue;
    }

    const isSupportedByResume = resumeSignals.some((signal) => hasSkillPhrase(resumeText, signal));

    if (!isSupportedByResume) {
      gaps.push(canonicalGap);
    }
  }

  return gaps;
}

function normalizeFinalCriticalGaps(analysis, { jobDescriptionText, resumeText }) {
  const deterministicGaps = [];
  const requiredYears = analysis?.requiredExperienceYears ?? getRequiredExperienceYears(jobDescriptionText);
  const experienceGate = analysis?.experienceGate;
  const levelGap = analysis?.levelGap;

  if (requiredYears !== null && requiredYears >= 3 && experienceGate !== 'Pass') {
    deterministicGaps.push(`${requiredYears}+ years experience requirement not met`);
  }

  if (['Severe Gap'].includes(experienceGate) || levelGap === 'Severe') {
    return sortCriticalGaps(deterministicGaps.length > 0 ? deterministicGaps : ['Severe experience-level mismatch']);
  }

  const modelGaps = normalizeStringList(analysis?.criticalGaps).filter(
    (gap) =>
      !isPreferredOnlyGap(gap, jobDescriptionText) &&
      !isUnsupportedInferredExperienceGap(gap, jobDescriptionText) &&
      isRequiredBackedCriticalGap(gap, jobDescriptionText),
  );

  const requiredSkillGaps = getDeterministicRequiredSkillGaps(resumeText, jobDescriptionText);

  return sortCriticalGaps([...deterministicGaps, ...modelGaps, ...requiredSkillGaps]).slice(0, 5);
}

function canonicalizeFinalAnalysis(analysis, { jobDescriptionText, resumeText }) {
  const scoreCalibratedAnalysis = {
    ...analysis,
    fitScore: getDeterministicFitScore(analysis),
  };
  const evidenceCalibratedAnalysis = {
    ...scoreCalibratedAnalysis,
    applicationRequirements: normalizeStringList(scoreCalibratedAnalysis?.applicationRequirements),
    strongMatches: normalizeStrongMatches(scoreCalibratedAnalysis?.strongMatches, {
      resumeText,
      jobDescriptionText,
    }),
    criticalGaps: normalizeFinalCriticalGaps(scoreCalibratedAnalysis, { jobDescriptionText, resumeText }),
  };
  const fitCalibratedAnalysis = {
    ...evidenceCalibratedAnalysis,
    fitScore: getEvidenceStabilizedFitScore(evidenceCalibratedAnalysis),
  };
  const chanceCalibratedAnalysis = {
    ...fitCalibratedAnalysis,
    interviewChance: getDeterministicInterviewChance(fitCalibratedAnalysis, jobDescriptionText),
  };

  return normalizeRecommendationWithEvidenceConsistency({
    ...chanceCalibratedAnalysis,
    recommendation: getDeterministicRecommendation(chanceCalibratedAnalysis),
  });
}

export function applyFinalConsistencyRepair(
  analysis,
  { resumeText, jobDescriptionText, optimizeForApplicationRoi = true },
) {
  const genericAnalysis = {
    ...analysis,
    shortReasoning: normalizePublicLanguage(analysis?.shortReasoning),
  };
  const recommendationConsistentAnalysis = canonicalizeFinalAnalysis(
    repairRecommendationForConsistency(genericAnalysis),
    { jobDescriptionText, resumeText },
  );

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
  const finalRecommendationAnalysis = applyRecommendationHardRules(
    canonicalizeFinalAnalysis(reasoningConsistentAnalysis, { jobDescriptionText, resumeText }),
  );
  const technicalAnalysis =
    finalRecommendationAnalysis.recommendation !== reasoningConsistentAnalysis.recommendation
      ? {
          ...finalRecommendationAnalysis,
          shortReasoning: buildConsistentReasoning(finalRecommendationAnalysis),
        }
      : finalRecommendationAnalysis;
  const roiStrategyAnalysis = applyRoiStrategy(technicalAnalysis, {
    jobDescriptionText,
    optimizeForApplicationRoi: true,
  });
  const selectedAnalysis = optimizeForApplicationRoi ? roiStrategyAnalysis : technicalAnalysis;

  return stripInternalFields({
    ...selectedAnalysis,
    fitScore: getStableDisplayedFitScore(selectedAnalysis),
    technicalRecommendation: technicalAnalysis.recommendation,
    technicalReasoning: technicalAnalysis.shortReasoning,
    roiRecommendation: roiStrategyAnalysis.recommendation,
    roiReasoning: roiStrategyAnalysis.shortReasoning,
  });
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
