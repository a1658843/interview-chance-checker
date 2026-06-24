export const allowedApplicationRequirements = [
  'AI Interview Required',
  'Coding Challenge Required',
  'Video Submission Required',
  'Take-Home Project Required',
  'Portfolio Submission Required',
  'Multi-hour Assessment Required',
  'Work Sample Required',
  'Extra Platform Registration Required',
  'Onsite Interview Required',
];

export const effortLevels = ['Low', 'Medium', 'High', 'Very High'];

const allowedRequirementSet = new Set(allowedApplicationRequirements);
const requirementAliases = new Map([
  ['Take-home Project Required', 'Take-Home Project Required'],
  ['Portfolio Required', 'Portfolio Submission Required'],
]);

const requirementPatterns = [
  {
    requirement: 'AI Interview Required',
    patterns: [
      /\bai\b[^.\n]{0,80}\binterview\b/i,
      /\bai[-\s]?based\b[^.\n]{0,80}\binterview\b/i,
      /\bartificial intelligence\b[^.\n]{0,80}\binterview\b/i,
      /\bautomated\b[^.\n]{0,80}\binterview\b/i,
      /\bcomplete\b[^.\n]{0,80}\bai\b[^.\n]{0,80}\binterview\b/i,
      /\bai\b[^.\n]{0,40}\bscreening\b[^.\n]{0,40}\binterview\b/i,
      /\bai\b[^.\n]{0,40}\brecruiter\b[^.\n]{0,40}\binterview\b/i,
      /\bchatbot\b[^.\n]{0,80}\binterview\b/i,
      /\brecorded\b[^.\n]{0,40}\bai\b[^.\n]{0,40}\binterview\b/i,
      /\binterview\b[^.\n]{0,80}\bbased on your resume\b/i,
      /\binterview\b[^.\n]{0,80}\b(?:ai|artificial intelligence|automated)\b/i,
    ],
  },
  {
    requirement: 'Coding Challenge Required',
    patterns: [
      /\bcoding challenge\b/i,
      /\btechnical challenge\b/i,
      /\bAPI\b[^.\n]{0,80}\bchallenge\b/i,
      /\bchallenge\b[^.\n]{0,80}\bsubmit\b/i,
      /\bcomplete\b[^.\n]{0,80}\bchallenge\b/i,
    ],
  },
  {
    requirement: 'Take-Home Project Required',
    patterns: [/\btake[-\s]?home\b/i, /\bhome assignment\b/i, /\bassessment project\b/i],
  },
  {
    requirement: 'Video Submission Required',
    patterns: [
      /\bvideo submission\b/i,
      /\bvideo walkthrough\b/i,
      /\brecord\b[^.\n]{0,80}\bvideo\b/i,
      /\bsubmit\b[^.\n]{0,80}\bvideo\b/i,
    ],
  },
  {
    requirement: 'Portfolio Submission Required',
    patterns: [/\bportfolio required\b/i, /\bsubmit\b[^.\n]{0,80}\bportfolio\b/i],
  },
  {
    requirement: 'Multi-hour Assessment Required',
    patterns: [
      /\bmulti[-\s]?hour\b[^.\n]{0,80}\b(?:assessment|challenge|project|exercise)\b/i,
      /\b(?:assessment|challenge|project|exercise)\b[^.\n]{0,80}\bmulti[-\s]?hour\b/i,
      /\b\d+\s*(?:hour|hr)s?\b[^.\n]{0,80}\b(?:assessment|challenge|project|exercise)\b/i,
    ],
  },
  {
    requirement: 'Work Sample Required',
    patterns: [/\bwork sample\b/i, /\bwriting sample\b/i, /\bcode sample\b/i],
  },
  {
    requirement: 'Extra Platform Registration Required',
    patterns: [
      /\bregister\b[^.\n]{0,80}\b(?:platform|portal|account|website)\b/i,
      /\bcreate\b[^.\n]{0,80}\b(?:platform|portal|account)\b/i,
      /\bsign up\b[^.\n]{0,80}\b(?:platform|portal|account|website)\b/i,
    ],
  },
  {
    requirement: 'Onsite Interview Required',
    patterns: [/\bonsite interview\b/i, /\bon-site interview\b/i, /\bin[-\s]?person interview\b/i],
  },
];

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function hasMatch(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function normalizeApplicationRequirements(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return unique(
    value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .map((item) => requirementAliases.get(item) ?? item)
      .filter((item) => allowedRequirementSet.has(item)),
  );
}

export function extractApplicationRequirements(jobDescriptionText) {
  const text = String(jobDescriptionText ?? '');
  return requirementPatterns
    .filter(({ patterns }) => hasMatch(text, patterns))
    .map(({ requirement }) => requirement);
}

export function getEffortLevel(applicationRequirements) {
  const requirements = normalizeApplicationRequirements(applicationRequirements);
  const majorSteps = requirements.filter((requirement) =>
    [
      'AI Interview Required',
      'Coding Challenge Required',
      'Take-Home Project Required',
      'Multi-hour Assessment Required',
      'Video Submission Required',
      'Work Sample Required',
    ].includes(requirement),
  );

  if (
    requirements.includes('AI Interview Required') ||
    requirements.includes('Multi-hour Assessment Required') ||
    (requirements.includes('Coding Challenge Required') && requirements.includes('Video Submission Required')) ||
    majorSteps.length >= 2
  ) {
    return 'Very High';
  }

  if (
    requirements.includes('Coding Challenge Required') ||
    requirements.includes('Take-Home Project Required')
  ) {
    return 'High';
  }

  if (
    requirements.includes('Video Submission Required') ||
    requirements.includes('Portfolio Submission Required') ||
    requirements.includes('Work Sample Required') ||
    requirements.includes('Extra Platform Registration Required') ||
    requirements.includes('Onsite Interview Required')
  ) {
    return 'Medium';
  }

  return 'Low';
}

export function applyApplicationRequirements(analysis, jobDescriptionText) {
  const modelRequirements = normalizeApplicationRequirements(analysis?.applicationRequirements);
  const deterministicRequirements = extractApplicationRequirements(jobDescriptionText);
  const applicationRequirements = unique([...modelRequirements, ...deterministicRequirements]);

  return {
    ...analysis,
    applicationRequirements,
    effortLevel: getEffortLevel(applicationRequirements),
  };
}
