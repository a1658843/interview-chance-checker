export const allowedApplicationRequirements = [
  'Coding Challenge Required',
  'Take-home Project Required',
  'Video Submission Required',
  'Portfolio Required',
  'Multi-hour Assessment Required',
  'Work Sample Required',
  'Extra Platform Registration Required',
  'Onsite Interview Required',
];

export const effortLevels = ['Low', 'Medium', 'High', 'Very High'];

const allowedRequirementSet = new Set(allowedApplicationRequirements);

const requirementPatterns = [
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
    requirement: 'Take-home Project Required',
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
    requirement: 'Portfolio Required',
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
      'Coding Challenge Required',
      'Take-home Project Required',
      'Multi-hour Assessment Required',
      'Video Submission Required',
      'Work Sample Required',
    ].includes(requirement),
  );

  if (
    requirements.includes('Multi-hour Assessment Required') ||
    (requirements.includes('Coding Challenge Required') && requirements.includes('Video Submission Required')) ||
    majorSteps.length >= 2
  ) {
    return 'Very High';
  }

  if (
    requirements.includes('Coding Challenge Required') ||
    requirements.includes('Take-home Project Required')
  ) {
    return 'High';
  }

  if (
    requirements.includes('Video Submission Required') ||
    requirements.includes('Portfolio Required') ||
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
