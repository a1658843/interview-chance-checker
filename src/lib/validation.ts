import { normalizeText } from './textUtils';

const RESUME_HEADING_PATTERNS = [
  /^\s*education\s*$/im,
  /^\s*(professional\s+)?experience\s*$/im,
  /^\s*(technical\s+)?skills\s*$/im,
  /^\s*projects\s*$/im,
  /^\s*certifications\s*$/im,
];

const RESUME_CONTENT_PATTERNS = [
  /\bsoftware engineer intern\b/i,
  /\b(bachelor'?s?|b\.?\s*s\.?|master'?s?|m\.?\s*s\.?|ph\.?\s*d\.?|doctorate)\b/i,
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\s*(?:-|–|to)\s*(?:present|current|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4})\b/i,
  /\b\d{4}\s*(?:-|–|to)\s*(?:present|current|\d{4})\b/i,
];

const UNIVERSITY_PATTERNS = [
  /\b(bachelor|master|b\.s\.|m\.s\.|ph\.d\.|degree)\b[\s\S]{0,80}\b(university|college|institute)\b/i,
  /\b(university|college|institute)\b[\s\S]{0,80}\b(bachelor|master|b\.s\.|m\.s\.|ph\.d\.|degree)\b/i,
  /\binstitute of technology\b/i,
  /\bschool of engineering\b/i,
];

const JOB_POSTING_PATTERNS = [
  /^\s*linkedin job posting\s*$/im,
  /^\s*title\s*:/im,
  /^\s*company\s*:/im,
  /^\s*job description\s*:/im,
  /\bjob type\b/i,
  /\bdescription\b/i,
  /\bposition overview\b/i,
  /\bcore responsibilities\b/i,
  /\bresponsibilities\b/i,
  /\beducation and experience\b/i,
  /\btechnical skills\b/i,
  /\bphysical requirements\b/i,
  /\babout the job\b/i,
  /\babout the role\b/i,
  /\bwhat you(?:'|’)ll do\b/i,
  /\bwhat you will do\b/i,
  /\bwhat you(?:'|’)ll need\b/i,
  /\bwhat you will need\b/i,
  /\bwho you are\b/i,
  /\brequirements\b/i,
  /\bqualifications\b/i,
  /\bpreferred qualifications\b/i,
  /\bbenefits\b/i,
  /\bsalary\b/i,
  /\bpay range\b/i,
  /\bequal opportunity\b/i,
  /\bremote\b/i,
  /\bfull-time\b/i,
  /\bfull time\b/i,
  /\bapply\b/i,
  /\bcompany description\b/i,
];

function hasLinkedInJobPostingStructure(value: string) {
  const hasLinkedInHeader = /^\s*linkedin job posting\s*$/im.test(value);
  const hasTitleMetadata = /^\s*title\s*:/im.test(value);
  const hasCompanyMetadata = /^\s*company\s*:/im.test(value);
  const hasSourceMetadata = /^\s*source\s*:\s*linkedin\s*$/im.test(value);
  const hasLinkedInJobsUrl = /linkedin\.com\/jobs\//i.test(value);
  const hasJobDescriptionMetadata = /^\s*job description\s*:/im.test(value);

  return (
    hasLinkedInHeader &&
    hasJobDescriptionMetadata &&
    (hasTitleMetadata || hasCompanyMetadata || hasSourceMetadata || hasLinkedInJobsUrl)
  );
}

function hasPersonalEmail(value: string) {
  const emails = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const organizationalPrefixes =
    /^(accommodation|benefits?|careers?|compliance|contact|help|hr|info|jobs?|leave(?:benefits?)?|no-reply|noreply|people|recruit(?:ing|er)?|support|talent)@/i;
  const freeEmailDomains = /@(gmail|yahoo|outlook|hotmail|icloud|aol|proton|live|msn)\./i;

  return emails.some((email) => freeEmailDomains.test(email) || !organizationalPrefixes.test(email));
}

function hasGithubProfileUrl(value: string) {
  const githubUrlPattern = /github\.com\/([a-z0-9-]+)(?:[/?#\s]|$)/gi;

  for (const match of value.matchAll(githubUrlPattern)) {
    const afterMatch = value[(match.index ?? 0) + match[0].length - 1] ?? '';

    if (afterMatch === '/' && /github\.com\/[a-z0-9-]+\/[a-z0-9._-]+/i.test(value.slice(match.index ?? 0))) {
      continue;
    }

    return true;
  }

  return false;
}

function hasGithubRepositoryUrl(value: string) {
  return /github\.com\/[a-z0-9-]+\/[a-z0-9._-]+/i.test(value);
}

function hasLinkedInProfileUrl(value: string) {
  return /linkedin\.com\/in\/[a-z0-9-]+/i.test(value);
}

function hasPersonalProfileLink(value: string) {
  return hasGithubProfileUrl(value) || hasLinkedInProfileUrl(value);
}

function hasPhoneNumber(value: string) {
  const phonePattern = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g;

  for (const match of value.matchAll(phonePattern)) {
    const index = match.index ?? 0;
    const before = value[index - 1] ?? '';
    const after = value[index + match[0].length] ?? '';

    if (!/[a-z0-9/_-]/i.test(before) && !/[a-z0-9/_-]/i.test(after)) {
      return true;
    }
  }

  return false;
}

function hasIgnoredPhoneLikeUrl(value: string) {
  const phonePattern = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g;

  for (const match of value.matchAll(phonePattern)) {
    const index = match.index ?? 0;
    const before = value[index - 1] ?? '';
    const after = value[index + match[0].length] ?? '';

    if (/[a-z0-9/_-]/i.test(before) || /[a-z0-9/_-]/i.test(after)) {
      return true;
    }
  }

  return false;
}

function getResumeSignalCount(value: string) {
  const resumeHeadingSignals = RESUME_HEADING_PATTERNS.filter((pattern) => pattern.test(value)).length;
  const resumeContentSignals = RESUME_CONTENT_PATTERNS.filter((pattern) => pattern.test(value)).length;
  const universitySignals = UNIVERSITY_PATTERNS.filter((pattern) => pattern.test(value)).length;
  const hasPhone = hasPhoneNumber(value);
  const hasEmail = hasPersonalEmail(value);
  const hasProfileLink = hasPersonalProfileLink(value);
  const contactSignals = [hasPhone, hasEmail, hasProfileLink].filter(Boolean).length;

  return resumeHeadingSignals + resumeContentSignals + universitySignals + contactSignals;
}

function getResumeSignalDetails(value: string) {
  const resumeHeadingSignals = RESUME_HEADING_PATTERNS.filter((pattern) => pattern.test(value)).length;
  const resumeContentSignals = RESUME_CONTENT_PATTERNS.filter((pattern) => pattern.test(value)).length;
  const universitySignals = UNIVERSITY_PATTERNS.filter((pattern) => pattern.test(value)).length;
  const hasPhone = hasPhoneNumber(value);
  const hasEmail = hasPersonalEmail(value);
  const hasProfileLink = hasPersonalProfileLink(value);
  const hasDateRange =
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\s*(?:-|â€“|to)\s*(?:present|current|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4})\b/i.test(value) ||
    /\b\d{4}\s*(?:-|â€“|to)\s*(?:present|current|\d{4})\b/i.test(value);
  const hasFirstPersonSummary = /\b(i am|i'm|my background|my experience|i have|i built|i led|i developed)\b/i.test(value);
  const jobPostingSignals = getJobPostingSignalCount(value);
  const hasResumeContactContext =
    jobPostingSignals < 4 ||
    hasPhone ||
    hasProfileLink ||
    hasFirstPersonSummary ||
    /\b(?:github|portfolio|email|phone)\b/i.test(value);
  const hasEmployerDateEntry = splitLines(value).some(
    (line) =>
      hasDateRange &&
      /\b(engineer|developer|intern|consultant|analyst|manager|specialist)\b/i.test(line),
  );
  const contactSignals = [hasPhone, hasEmail && hasResumeContactContext, hasProfileLink].filter(Boolean).length;

  return {
    contactSignals,
    hasDateRange,
    hasEmployerDateEntry,
    hasFirstPersonSummary,
    hasProfileLink,
    resumeContentSignals,
    resumeHeadingSignals,
    universitySignals,
  };
}

function splitLines(value: string) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getJobPostingSignalCount(value: string) {
  return JOB_POSTING_PATTERNS.filter((pattern) => pattern.test(value)).length;
}

export type JobDescriptionInputSource = 'extension_handoff' | 'manual_paste' | 'unknown';

function hasStrongLinkedInExtensionJobEvidence(value: string, inputSource: JobDescriptionInputSource) {
  if (inputSource !== 'extension_handoff' || !hasLinkedInJobPostingStructure(value)) {
    return false;
  }

  const jobSignals = getDetectedJobSignals(value);
  const hasStructuredMetadata =
    jobSignals.includes('job_title_metadata') ||
    jobSignals.includes('company_metadata') ||
    jobSignals.includes('linkedin_source_metadata') ||
    jobSignals.includes('linkedin_jobs_url');
  const hasMeaningfulJobContent =
    jobSignals.includes('responsibilities_section') ||
    jobSignals.includes('qualifications_section') ||
    jobSignals.includes('requirements_section') ||
    jobSignals.includes('about_the_job_section');

  return hasStructuredMetadata && hasMeaningfulJobContent;
}

function hasStrongCandidateResumeEvidence(value: string) {
  const {
    contactSignals,
    hasDateRange,
    hasEmployerDateEntry,
    hasFirstPersonSummary,
    hasProfileLink,
    resumeHeadingSignals,
    universitySignals,
  } = getResumeSignalDetails(value);

  return (
    (hasProfileLink && contactSignals >= 2 && (hasDateRange || hasEmployerDateEntry || resumeHeadingSignals >= 2)) ||
    (resumeHeadingSignals >= 3 && (hasDateRange || hasEmployerDateEntry || universitySignals >= 1)) ||
    (hasFirstPersonSummary && contactSignals >= 1 && resumeHeadingSignals >= 2)
  );
}

function getDetectedResumeSignals(value: string) {
  const {
    contactSignals,
    hasDateRange,
    hasEmployerDateEntry,
    hasFirstPersonSummary,
    hasProfileLink,
    resumeContentSignals,
    resumeHeadingSignals,
    universitySignals,
  } = getResumeSignalDetails(value);
  const signals: string[] = [];

  if (hasPersonalEmail(value)) signals.push('personal_email');
  if (hasPhoneNumber(value)) signals.push('phone_number');
  if (hasLinkedInProfileUrl(value)) signals.push('linkedin_profile_url');
  if (hasGithubProfileUrl(value)) signals.push('github_profile_url');
  if (hasGithubRepositoryUrl(value)) signals.push('github_repository_url');
  if (/linkedin\.com\/jobs\//i.test(value)) signals.push('linkedin_jobs_url');
  if (hasIgnoredPhoneLikeUrl(value)) signals.push('url_numeric_segment');
  if (resumeHeadingSignals >= 3) signals.push('resume_section_triplet');
  else if (resumeHeadingSignals > 0) signals.push(`resume_headings_${resumeHeadingSignals}`);
  if (resumeContentSignals > 0) signals.push(`resume_content_patterns_${resumeContentSignals}`);
  if (universitySignals > 0) signals.push(`university_patterns_${universitySignals}`);
  if (hasDateRange) signals.push('candidate_date_pattern');
  if (hasEmployerDateEntry) signals.push('employer_date_entry');
  if (hasFirstPersonSummary) signals.push('first_person_summary');
  if (contactSignals > 0) signals.push(`resume_contact_signals_${contactSignals}`);
  if (hasProfileLink) signals.push('personal_profile_url');

  return Array.from(new Set(signals));
}

function getDetectedJobSignals(value: string) {
  const signals: string[] = [];

  if (/^\s*linkedin job posting\s*$/im.test(value)) signals.push('linkedin_job_header');
  if (/^\s*title\s*:/im.test(value)) signals.push('job_title_metadata');
  if (/^\s*company\s*:/im.test(value)) signals.push('company_metadata');
  if (/^\s*location\s*:/im.test(value)) signals.push('location_metadata');
  if (/^\s*employment type\s*:/im.test(value)) signals.push('employment_type_metadata');
  if (/^\s*workplace type\s*:/im.test(value)) signals.push('workplace_type_metadata');
  if (/^\s*source\s*:\s*linkedin\s*$/im.test(value)) signals.push('linkedin_source_metadata');
  if (/linkedin\.com\/jobs\//i.test(value)) signals.push('linkedin_jobs_url');
  if (hasIgnoredPhoneLikeUrl(value)) signals.push('url_numeric_segment');
  if (/^\s*job description\s*:/im.test(value)) signals.push('job_description_metadata');
  if (/\bresponsibilities\b/i.test(value)) signals.push('responsibilities_section');
  if (/\bqualifications\b/i.test(value)) signals.push('qualifications_section');
  if (/\brequirements\b/i.test(value)) signals.push('requirements_section');
  if (/\babout the job\b/i.test(value)) signals.push('about_the_job_section');
  if (/\bapply\b/i.test(value)) signals.push('apply_language');
  if (/\bremote\b/i.test(value)) signals.push('remote_language');

  return Array.from(new Set(signals));
}

function getResumeLikeTriggeredRule(value: string, inputSource: JobDescriptionInputSource = 'unknown') {
  const normalized = normalizeText(value);
  const {
    contactSignals,
    hasDateRange,
    hasEmployerDateEntry,
    hasFirstPersonSummary,
    hasProfileLink,
    resumeContentSignals,
    resumeHeadingSignals,
    universitySignals,
  } = getResumeSignalDetails(value);
  const resumeSignals = resumeHeadingSignals + resumeContentSignals + universitySignals + contactSignals;
  const jobPostingSignals = getJobPostingSignalCount(value);

  if (!normalized) return null;

  if (hasStrongLinkedInExtensionJobEvidence(value, inputSource) && !hasStrongCandidateResumeEvidence(value)) {
    return null;
  }

  if (
    hasLinkedInJobPostingStructure(value) &&
    contactSignals < 2 &&
    !hasProfileLink &&
    !hasEmployerDateEntry &&
    !(hasFirstPersonSummary && hasDateRange)
  ) {
    return null;
  }

  if (
    jobPostingSignals >= 4 &&
    contactSignals === 0 &&
    !hasDateRange &&
    !hasFirstPersonSummary &&
    !hasEmployerDateEntry
  ) {
    return null;
  }

  if (contactSignals >= 2) return 'contact_signals_at_least_2';
  if (contactSignals >= 1 && (resumeHeadingSignals >= 1 || universitySignals >= 1 || hasDateRange)) {
    return 'contact_plus_resume_context';
  }
  if (resumeHeadingSignals >= 2 && (hasDateRange || universitySignals >= 1 || hasEmployerDateEntry)) {
    return 'resume_headings_plus_history_context';
  }
  if (hasFirstPersonSummary && resumeSignals >= 2 && jobPostingSignals < 3) return 'first_person_resume_summary';
  if (resumeSignals >= 4 && jobPostingSignals < 3) return 'resume_signals_without_job_context';

  return null;
}

export function textLooksLikeResume(value: string, inputSource: JobDescriptionInputSource = 'unknown') {
  const normalized = normalizeText(value);
  const hasLinkedInJobMetadata = hasLinkedInJobPostingStructure(value);
  const {
    contactSignals,
    hasDateRange,
    hasEmployerDateEntry,
    hasFirstPersonSummary,
    hasProfileLink,
    resumeContentSignals,
    resumeHeadingSignals,
    universitySignals,
  } = getResumeSignalDetails(value);
  const resumeSignals = resumeHeadingSignals + resumeContentSignals + universitySignals + contactSignals;
  const jobPostingSignals = getJobPostingSignalCount(value);

  if (!normalized) {
    return false;
  }

  if (hasStrongLinkedInExtensionJobEvidence(value, inputSource) && !hasStrongCandidateResumeEvidence(value)) {
    return false;
  }

  if (
    hasLinkedInJobMetadata &&
    contactSignals < 2 &&
    !hasProfileLink &&
    !hasEmployerDateEntry &&
    !(hasFirstPersonSummary && hasDateRange)
  ) {
    return false;
  }

  if (
    jobPostingSignals >= 4 &&
    contactSignals === 0 &&
    !hasDateRange &&
    !hasFirstPersonSummary &&
    !hasEmployerDateEntry
  ) {
    return false;
  }

  return (
    contactSignals >= 2 ||
    (contactSignals >= 1 && (resumeHeadingSignals >= 1 || universitySignals >= 1 || hasDateRange)) ||
    (resumeHeadingSignals >= 2 && (hasDateRange || universitySignals >= 1 || hasEmployerDateEntry)) ||
    (hasFirstPersonSummary && resumeSignals >= 2 && jobPostingSignals < 3) ||
    (resumeSignals >= 4 && jobPostingSignals < 3)
  );
}

export function textLooksLikeJobPosting(value: string) {
  const normalized = normalizeText(value);
  const hasLinkedInJobMetadata = hasLinkedInJobPostingStructure(value);
  const resumeSignals = getResumeSignalCount(value);
  const jobPostingSignals = getJobPostingSignalCount(value);

  if (!normalized) {
    return false;
  }

  if (hasLinkedInJobMetadata) {
    return true;
  }

  return jobPostingSignals >= 2 && !(resumeSignals >= 3 && jobPostingSignals < 4);
}

export function validateAnalysisInputs(
  resumeText: string,
  jobDescriptionText: string,
  inputSource: JobDescriptionInputSource = 'unknown',
) {
  const resumeLooksLikeResume = textLooksLikeResume(resumeText);
  const resumeLooksLikeJobPosting = textLooksLikeJobPosting(resumeText);
  const jobDescriptionLooksLikeResume = textLooksLikeResume(jobDescriptionText, inputSource);
  const jobDescriptionLooksLikeJobPosting = textLooksLikeJobPosting(jobDescriptionText);

  if (resumeLooksLikeResume && jobDescriptionLooksLikeResume) {
    return 'Both fields appear to contain resume content. Paste a resume in Resume Text and a job posting in Job Description.';
  }

  if (resumeLooksLikeJobPosting && jobDescriptionLooksLikeJobPosting) {
    return 'Both fields appear to contain job postings. Paste a resume in Resume Text and a job posting in Job Description.';
  }

  if (resumeLooksLikeJobPosting && jobDescriptionLooksLikeResume) {
    return 'The fields appear to be swapped: Resume Text looks like a job posting, and Job Description looks like resume content.';
  }

  if (resumeLooksLikeJobPosting) {
    return 'The Resume Text field appears to contain a job posting.';
  }

  if (jobDescriptionLooksLikeResume) {
    return 'The Job Description field appears to contain resume content instead of a job posting.';
  }

  return null;
}

export type AnalysisInputValidationDebug = ReturnType<typeof getAnalysisInputValidationDebug>;

export function getAnalysisInputValidationDebug(
  resumeText: string,
  jobDescriptionText: string,
  inputSource: JobDescriptionInputSource = 'unknown',
) {
  const resumeLooksLikeResume = textLooksLikeResume(resumeText);
  const resumeLooksLikeJobPosting = textLooksLikeJobPosting(resumeText);
  const jobDescriptionLooksLikeResume = textLooksLikeResume(jobDescriptionText, inputSource);
  const jobDescriptionLooksLikeJobPosting = textLooksLikeJobPosting(jobDescriptionText);
  const validationError = validateAnalysisInputs(resumeText, jobDescriptionText, inputSource);

  return {
    resume: {
      normalizedLength: normalizeText(resumeText).trim().length,
      detectedResumeSignals: getDetectedResumeSignals(resumeText),
      detectedJobSignals: getDetectedJobSignals(resumeText),
      looksLikeResume: resumeLooksLikeResume,
      looksLikeJobPosting: resumeLooksLikeJobPosting,
      resumeLikeTriggeredRule: getResumeLikeTriggeredRule(resumeText),
    },
    jobDescriptionValidationDebug: {
      inputSource,
      normalizedLength: normalizeText(jobDescriptionText).trim().length,
      resumeLength: normalizeText(resumeText).trim().length,
      isLinkedInJobPayload: hasLinkedInJobPostingStructure(jobDescriptionText),
      detectedResumeSignals: getDetectedResumeSignals(jobDescriptionText),
      detectedJobSignals: getDetectedJobSignals(jobDescriptionText),
      looksLikeResume: jobDescriptionLooksLikeResume,
      looksLikeJobPosting: jobDescriptionLooksLikeJobPosting,
      resumeLikeTriggeredRule: getResumeLikeTriggeredRule(jobDescriptionText, inputSource),
      phoneLikeUrlIgnored: hasIgnoredPhoneLikeUrl(jobDescriptionText),
      containsLinkedInJobsUrl: /linkedin\.com\/jobs\//i.test(jobDescriptionText),
      containsLinkedInProfileUrl: /linkedin\.com\/in\/[a-z0-9-]+/i.test(jobDescriptionText),
      triggeredRule: validationError
        ? validationError.startsWith('Both fields appear to contain resume content')
          ? 'both_fields_resume_content'
          : validationError.startsWith('Both fields appear to contain job postings')
            ? 'both_fields_job_postings'
            : validationError.startsWith('The fields appear to be swapped')
              ? 'fields_swapped'
              : validationError.startsWith('The Resume Text field')
                ? 'resume_field_job_posting'
                : validationError.startsWith('The Job Description field')
                  ? 'job_description_field_resume_content'
                  : 'unknown_validation_error'
        : null,
    },
  };
}

export function shouldShowValidationDebug(
  isDevelopment: boolean,
  debug: AnalysisInputValidationDebug | null | undefined,
) {
  return Boolean(
    isDevelopment &&
      debug?.jobDescriptionValidationDebug.triggeredRule === 'both_fields_resume_content',
  );
}
