import { normalizeText } from './textUtils';

const RESUME_HEADING_PATTERNS = [
  /^\s*education\s*$/im,
  /^\s*(professional\s+)?experience\s*$/im,
  /^\s*(technical\s+)?skills\s*$/im,
  /^\s*projects\s*$/im,
  /^\s*certifications\s*$/im,
];

const UNIVERSITY_PATTERNS = [
  /\b(bachelor|master|b\.s\.|m\.s\.|ph\.d\.|degree)\b[\s\S]{0,80}\b(university|college|institute)\b/i,
  /\b(university|college|institute)\b[\s\S]{0,80}\b(bachelor|master|b\.s\.|m\.s\.|ph\.d\.|degree)\b/i,
  /\binstitute of technology\b/i,
  /\bschool of engineering\b/i,
];

const JOB_POSTING_PATTERNS = [
  /\babout the job\b/i,
  /\babout the role\b/i,
  /\bwhat you will do\b/i,
  /\bwho you are\b/i,
  /\brequirements\b/i,
  /\bqualifications\b/i,
  /\bbenefits\b/i,
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
  const organizationalPrefixes = /^(careers|jobs|recruiting|talent|hr|people|support|info|hello|noreply|no-reply)@/i;

  return emails.some((email) => !organizationalPrefixes.test(email));
}

export function jobDescriptionLooksLikeResume(value: string) {
  const normalized = normalizeText(value);
  const resumeHeadingSignals = RESUME_HEADING_PATTERNS.filter((pattern) => pattern.test(value)).length;
  const universitySignals = UNIVERSITY_PATTERNS.filter((pattern) => pattern.test(value)).length;
  const jobPostingSignals = JOB_POSTING_PATTERNS.filter((pattern) => pattern.test(value)).length;
  const hasPhone = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/.test(value);
  const hasEmail = hasPersonalEmail(value);
  const hasProfileLink = /github\.com\/[a-z0-9-]+/i.test(value) || /linkedin\.com\/in\/[a-z0-9-]+/i.test(value);
  const contactSignals = [hasPhone, hasEmail, hasProfileLink].filter(Boolean).length;
  const resumeSignals = resumeHeadingSignals + universitySignals + contactSignals;

  if (jobPostingSignals >= 2 && contactSignals === 0 && resumeHeadingSignals < 3) {
    return false;
  }

  return resumeSignals >= 3 || (contactSignals >= 1 && resumeHeadingSignals + universitySignals >= 1);
}
