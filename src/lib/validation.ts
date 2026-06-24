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

function hasPersonalEmail(value: string) {
  const emails = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const organizationalPrefixes =
    /^(accommodation|benefits?|careers?|compliance|contact|help|hr|info|jobs?|leave(?:benefits?)?|no-reply|noreply|people|recruit(?:ing|er)?|support|talent)@/i;
  const freeEmailDomains = /@(gmail|yahoo|outlook|hotmail|icloud|aol|proton|live|msn)\./i;

  return emails.some((email) => freeEmailDomains.test(email) || !organizationalPrefixes.test(email));
}

function getResumeSignalCount(value: string) {
  const resumeHeadingSignals = RESUME_HEADING_PATTERNS.filter((pattern) => pattern.test(value)).length;
  const resumeContentSignals = RESUME_CONTENT_PATTERNS.filter((pattern) => pattern.test(value)).length;
  const universitySignals = UNIVERSITY_PATTERNS.filter((pattern) => pattern.test(value)).length;
  const hasPhone = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/.test(value);
  const hasEmail = hasPersonalEmail(value);
  const hasProfileLink = /github\.com\/[a-z0-9-]+/i.test(value) || /linkedin\.com\/in\/[a-z0-9-]+/i.test(value);
  const contactSignals = [hasPhone, hasEmail, hasProfileLink].filter(Boolean).length;

  return resumeHeadingSignals + resumeContentSignals + universitySignals + contactSignals;
}

function getResumeSignalDetails(value: string) {
  const resumeHeadingSignals = RESUME_HEADING_PATTERNS.filter((pattern) => pattern.test(value)).length;
  const resumeContentSignals = RESUME_CONTENT_PATTERNS.filter((pattern) => pattern.test(value)).length;
  const universitySignals = UNIVERSITY_PATTERNS.filter((pattern) => pattern.test(value)).length;
  const hasPhone = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/.test(value);
  const hasEmail = hasPersonalEmail(value);
  const hasProfileLink = /github\.com\/[a-z0-9-]+/i.test(value) || /linkedin\.com\/in\/[a-z0-9-]+/i.test(value);
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
    /\b(?:github|linkedin|portfolio|email|phone)\b/i.test(value);
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

export function textLooksLikeResume(value: string) {
  const normalized = normalizeText(value);
  const {
    contactSignals,
    hasDateRange,
    hasEmployerDateEntry,
    hasFirstPersonSummary,
    resumeContentSignals,
    resumeHeadingSignals,
    universitySignals,
  } = getResumeSignalDetails(value);
  const resumeSignals = resumeHeadingSignals + resumeContentSignals + universitySignals + contactSignals;
  const jobPostingSignals = getJobPostingSignalCount(value);

  if (!normalized) {
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
  const resumeSignals = getResumeSignalCount(value);
  const jobPostingSignals = getJobPostingSignalCount(value);

  if (!normalized) {
    return false;
  }

  return jobPostingSignals >= 2 && !(resumeSignals >= 3 && jobPostingSignals < 4);
}

export function validateAnalysisInputs(resumeText: string, jobDescriptionText: string) {
  const resumeLooksLikeResume = textLooksLikeResume(resumeText);
  const resumeLooksLikeJobPosting = textLooksLikeJobPosting(resumeText);
  const jobDescriptionLooksLikeResume = textLooksLikeResume(jobDescriptionText);
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
