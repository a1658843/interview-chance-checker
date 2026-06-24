import type { EffortLevel } from '../types/analysis';

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
    requirement: 'Video Submission Required',
    patterns: [
      /\bvideo submission\b/i,
      /\bvideo walkthrough\b/i,
      /\brecord\b[^.\n]{0,80}\bvideo\b/i,
      /\bsubmit\b[^.\n]{0,80}\bvideo\b/i,
    ],
  },
  {
    requirement: 'Take-Home Project Required',
    patterns: [/\btake[-\s]?home\b/i, /\bhome assignment\b/i, /\bassessment project\b/i],
  },
  {
    requirement: 'Portfolio Submission Required',
    patterns: [/\bportfolio required\b/i, /\bsubmit\b[^.\n]{0,80}\bportfolio\b/i],
  },
  {
    requirement: 'Extra Platform Registration Required',
    patterns: [
      /\bregister\b[^.\n]{0,80}\b(?:platform|portal|account|website)\b/i,
      /\bcreate\b[^.\n]{0,80}\b(?:platform|portal|account)\b/i,
      /\bsign up\b[^.\n]{0,80}\b(?:platform|portal|account|website)\b/i,
    ],
  },
] as const;

export function extractApplicationRequirements(jobDescriptionText: string) {
  return requirementPatterns
    .filter(({ patterns }) => patterns.some((pattern) => pattern.test(jobDescriptionText)))
    .map(({ requirement }) => requirement);
}

export function getEffortLevel(applicationRequirements: string[]): EffortLevel {
  if (
    applicationRequirements.includes('AI Interview Required') ||
    (applicationRequirements.includes('Coding Challenge Required') &&
      applicationRequirements.includes('Video Submission Required')) ||
    applicationRequirements.filter((requirement) =>
      [
        'Coding Challenge Required',
        'Video Submission Required',
        'Take-Home Project Required',
      ].includes(requirement),
    ).length >= 2
  ) {
    return 'Very High';
  }

  if (
    applicationRequirements.includes('Coding Challenge Required') ||
    applicationRequirements.includes('Take-Home Project Required')
  ) {
    return 'High';
  }

  return applicationRequirements.length > 0 ? 'Medium' : 'Low';
}
