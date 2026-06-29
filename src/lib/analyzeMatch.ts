import type { AnalysisResult, StrongMatch } from '../types/analysis';
import { clampScore, getRecommendation } from './scoring';
import { extractApplicationRequirements, getEffortLevel } from './applicationRequirements';
import { extractEmploymentType } from './employmentType';
import { extractKeywords, normalizeText } from './textUtils';

type RoleType = 'Backend' | 'Full stack' | 'Implementation engineer' | 'Frontend' | 'DevOps/SRE' | 'Senior/staff/principal';

type SkillSignal = {
  label: string;
  aliases: string[];
  related?: string[];
  categories: string[];
  kind: 'skill' | 'signal';
};

type SkillMatch = {
  signal: SkillSignal;
  matched: boolean;
  strength: number;
  evidence: string[];
};

type AlternativeTechnology = {
  label: string;
  phrases: string[];
};

const ROLE_TYPES: Array<{ type: RoleType; patterns: string[] }> = [
  {
    type: 'Implementation engineer',
    patterns: ['implementation', 'customer-facing technical', 'technical customer', 'solutions engineer', 'integrations'],
  },
  { type: 'Senior/staff/principal', patterns: ['senior', 'staff', 'principal', 'lead engineer'] },
  { type: 'Full stack', patterns: ['full-stack', 'full stack', 'frontend and backend', 'front end and back end'] },
  { type: 'Backend', patterns: ['backend', 'back end', 'api', 'server-side', 'server side'] },
  { type: 'Frontend', patterns: ['frontend', 'front end', 'react', 'ui engineer'] },
  { type: 'DevOps/SRE', patterns: ['devops', 'sre', 'site reliability', 'infrastructure', 'kubernetes'] },
];

const EARLY_CAREER_PATTERNS = [
  'growth mindset',
  'learn quickly',
  'not expected to know everything',
  'not expect you to know everything',
  '2+ years',
  'two years',
  'junior',
  'implementation',
  'customer-facing technical role',
  'customer facing technical role',
  'willingness to learn',
  'eager to learn',
  'can learn',
  'learn on the job',
];

const LEARNING_FRIENDLY_PATTERNS = [
  'learn quickly',
  'not expected to know everything',
  'not expect you to know everything',
  'growth mindset',
  'willingness to learn',
  'can learn',
  'learn on the job',
  'training',
];

const NON_REQUIREMENT_HEADINGS = [
  'benefits',
  'compensation',
  'salary',
  'pay range',
  'perks',
  '401k',
  'medical',
  'dental',
  'vision',
  'pto',
  'paid time off',
  'parental leave',
  'stock plans',
  'home office stipend',
  'company culture',
  'about us',
  'about the company',
  'equal opportunity',
  'eeo',
  'legal',
  'privacy',
  'authorization',
];

const OPTIONAL_HEADINGS = ['nice to have', 'nice-to-have', 'preferred', 'bonus', 'plus', 'extra credit'];
const SOFT_REQUIREMENT_LANGUAGE =
  /knowledge of or interest in|interest in|technologies such as|bonus points?|nice to have|nice-to-have|preferred|ability to learn quickly|learn quickly|not candidates who already have experience with every technology/i;

const REQUIRED_HEADINGS = [
  'requirements',
  'qualifications',
  'what you bring',
  'you have',
  'must have',
  'required',
  'minimum qualifications',
  'what we are looking for',
];

const SPECIALIZED_REQUIREMENTS = [
  { label: 'Flowable BPM', phrases: ['flowable', 'flowable bpm'] },
  { label: 'Camunda BPM', phrases: ['camunda', 'camunda bpm'] },
  { label: 'Activiti BPM', phrases: ['activiti', 'activiti bpm'] },
  { label: 'BPMN', phrases: ['bpmn'] },
  { label: 'DMN', phrases: ['dmn'] },
  { label: 'Workflow orchestration', phrases: ['workflow orchestration', 'workflow engine', 'workflow engines'] },
  { label: 'SAP', phrases: ['sap'] },
  { label: 'ServiceNow', phrases: ['servicenow', 'service now'] },
  { label: 'Salesforce', phrases: ['salesforce'] },
  { label: 'Workday', phrases: ['workday'] },
  { label: 'Quant Trading', phrases: ['quant trading', 'quantitative trading', 'quantitative finance'] },
  { label: 'Embedded C', phrases: ['embedded c'] },
  { label: 'FPGA', phrases: ['fpga'] },
  { label: 'Security Clearance', phrases: ['security clearance', 'clearance required', 'active clearance'] },
];

const PLATFORM_IDENTITY_ROLES = [
  {
    rolePatterns: ['ios', 'ios engineer', 'ios developer', 'mobile ios engineer', 'mobile engineer', 'swift', 'swiftui'],
    platform: { label: 'iOS development', phrases: ['ios', 'iphone', 'ipad', 'ios development'] },
    language: { label: 'Swift', phrases: ['swift'] },
    framework: { label: 'SwiftUI', phrases: ['swiftui'] },
    additionalGaps: [
      { label: 'iOS platform conventions', phrases: ['ios platform conventions', 'human interface guidelines', 'app store'] },
      { label: 'iOS accessibility', phrases: ['ios accessibility', 'voiceover', 'accessibility'] },
    ],
  },
  {
    rolePatterns: ['android', 'android engineer', 'android developer', 'mobile android engineer', 'mobile engineer', 'kotlin'],
    platform: { label: 'Android', phrases: ['android'] },
    language: { label: 'Kotlin / Java', phrases: ['kotlin', 'java'] },
    framework: { label: 'Android SDK / Jetpack', phrases: ['android sdk', 'jetpack', 'compose'] },
  },
  {
    rolePatterns: ['salesforce engineer', 'salesforce developer'],
    platform: { label: 'Salesforce', phrases: ['salesforce'] },
    language: { label: 'Apex', phrases: ['apex'] },
    framework: { label: 'Lightning Web Components', phrases: ['lightning web components', 'lwc'] },
  },
  {
    rolePatterns: ['sap engineer', 'sap developer'],
    platform: { label: 'SAP', phrases: ['sap'] },
    language: { label: 'ABAP', phrases: ['abap'] },
    framework: { label: 'SAP Fiori / UI5', phrases: ['sap fiori', 'fiori', 'sapui5', 'ui5'] },
  },
  {
    rolePatterns: ['servicenow engineer', 'service now engineer', 'servicenow developer', 'service now developer'],
    platform: { label: 'ServiceNow', phrases: ['servicenow', 'service now'] },
    language: { label: 'ServiceNow JavaScript', phrases: ['servicenow javascript', 'service now javascript'] },
    framework: { label: 'Now Platform', phrases: ['now platform', 'app engine studio', 'flow designer'] },
  },
  {
    rolePatterns: ['flowable engineer', 'flowable developer'],
    platform: { label: 'Flowable BPM', phrases: ['flowable', 'flowable bpm'] },
    language: { label: 'Java', phrases: ['java', 'spring', 'spring boot'] },
    framework: { label: 'BPMN / DMN / Workflow orchestration', phrases: ['bpmn', 'dmn', 'workflow orchestration'] },
  },
  {
    rolePatterns: ['react native', 'react native engineer', 'mobile engineer'],
    platform: { label: 'React Native', phrases: ['react native'] },
    language: { label: 'JavaScript / TypeScript', phrases: ['javascript', 'typescript'] },
    framework: { label: 'React Native framework', phrases: ['react native'] },
  },
  {
    rolePatterns: ['flutter', 'flutter engineer', 'mobile engineer'],
    platform: { label: 'Flutter', phrases: ['flutter'] },
    language: { label: 'Dart', phrases: ['dart'] },
    framework: { label: 'Flutter framework', phrases: ['flutter'] },
  },
];

const SKILL_SIGNALS: SkillSignal[] = [
  {
    label: 'API/backend experience',
    aliases: ['api', 'apis', 'backend', 'back end', 'server-side', 'server side', 'rest api', 'rest apis'],
    related: ['fastapi', 'python backend', 'node', 'express', 'django', 'flask', 'asp.net core'],
    categories: ['backend'],
    kind: 'signal',
  },
  {
    label: 'Implementation/integrations',
    aliases: ['implementation', 'implementations', 'integration', 'integrations', 'configure', 'configuration'],
    related: ['api', 'apis', 'webhook', 'data import', 'technical support'],
    categories: ['implementation'],
    kind: 'signal',
  },
  {
    label: 'SQL/database experience',
    aliases: ['sql', 'database', 'databases', 'postgres', 'postgresql', 'mysql', 'sql server'],
    related: ['supabase', 'relational database'],
    categories: ['database'],
    kind: 'signal',
  },
  {
    label: 'Python',
    aliases: ['python'],
    related: ['fastapi', 'django', 'flask', 'python backend'],
    categories: ['language', 'backend'],
    kind: 'skill',
  },
  {
    label: 'JavaScript/TypeScript',
    aliases: ['javascript', 'typescript', 'js', 'ts'],
    related: ['node', 'next.js', 'vite'],
    categories: ['language', 'frontend', 'backend'],
    kind: 'skill',
  },
  {
    label: 'Swift',
    aliases: ['swift'],
    related: ['ios'],
    categories: ['language', 'mobile'],
    kind: 'skill',
  },
  {
    label: 'SwiftUI',
    aliases: ['swiftui'],
    related: ['uikit', 'ios'],
    categories: ['mobile'],
    kind: 'skill',
  },
  {
    label: 'React/frontend',
    aliases: ['react', 'frontend', 'front end', 'ui'],
    related: ['typescript', 'javascript', 'vite', 'next.js'],
    categories: ['frontend'],
    kind: 'skill',
  },
  {
    label: 'Docker',
    aliases: ['docker', 'container', 'containers', 'containerization', 'containerized'],
    related: ['docker compose', 'kubernetes'],
    categories: ['devops'],
    kind: 'skill',
  },
  {
    label: 'GitHub Actions / CI/CD',
    aliases: ['github actions', 'ci/cd', 'cicd', 'continuous integration', 'continuous deployment'],
    related: ['gitlab ci', 'circleci', 'deployment pipeline'],
    categories: ['devops'],
    kind: 'skill',
  },
  {
    label: 'AWS',
    aliases: ['aws', 'amazon web services'],
    categories: ['devops'],
    kind: 'skill',
  },
  {
    label: 'Java',
    aliases: ['java', 'spring', 'spring boot'],
    categories: ['language', 'backend'],
    kind: 'skill',
  },
  {
    label: 'Bash',
    aliases: ['bash', 'shell scripting', 'shell scripts'],
    related: ['python scripts', 'automation scripts', 'scripting'],
    categories: ['scripting', 'backend'],
    kind: 'skill',
  },
  {
    label: 'Terraform',
    aliases: ['terraform', 'infrastructure as code', 'iac'],
    categories: ['devops'],
    kind: 'skill',
  },
  {
    label: 'Automated testing',
    aliases: ['testing', 'tests', 'automated testing', 'unit test', 'unit tests', 'integration test', 'integration tests'],
    related: ['pytest', 'jest', 'vitest'],
    categories: ['quality'],
    kind: 'signal',
  },
  {
    label: 'Customer-facing implementation work',
    aliases: ['customer-facing', 'customer facing', 'client-facing', 'client facing'],
    related: ['stakeholder', 'requirements gathering', 'technical communication', 'support'],
    categories: ['implementation'],
    kind: 'signal',
  },
  {
    label: 'Production AWS deployment',
    aliases: ['production aws deployment', 'aws deployment', 'deployed to aws', 'production cloud deployment'],
    related: ['production deployment', 'deployed production'],
    categories: ['deployment'],
    kind: 'signal',
  },
  {
    label: 'Enterprise integration experience',
    aliases: ['enterprise integration', 'enterprise integrations', 'enterprise customer', 'enterprise customers'],
    related: ['sso', 'webhook', 'api integration', 'data integration'],
    categories: ['implementation'],
    kind: 'signal',
  },
  {
    label: 'Technical consulting experience',
    aliases: ['technical consulting', 'solutions consulting', 'implementation consulting'],
    related: ['client discovery', 'customer discovery', 'requirements gathering'],
    categories: ['implementation'],
    kind: 'signal',
  },
  {
    label: 'System architecture',
    aliases: ['system architecture', 'architecture', 'architected', 'designed system', 'designed systems'],
    related: ['technical design', 'system design'],
    categories: ['architecture'],
    kind: 'signal',
  },
];

const ALTERNATIVE_TECHNOLOGIES: AlternativeTechnology[] = [
  { label: 'React', phrases: ['react'] },
  { label: 'Angular', phrases: ['angular'] },
  { label: 'Vue', phrases: ['vue', 'vue.js'] },
  { label: 'Python', phrases: ['python', 'fastapi', 'django', 'flask'] },
  { label: 'Java', phrases: ['java', 'spring', 'spring boot'] },
  { label: 'C# / .NET', phrases: ['c#', '.net', 'asp.net core'] },
  { label: 'AWS', phrases: ['aws', 'amazon web services'] },
  { label: 'Azure', phrases: ['azure', 'microsoft azure'] },
  { label: 'GCP', phrases: ['gcp', 'google cloud', 'google cloud platform'] },
  { label: 'Node.js', phrases: ['node', 'node.js'] },
  { label: 'SQL', phrases: ['sql', 'postgres', 'postgresql', 'mysql', 'sql server'] },
];

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => new RegExp(`(^|\\s)${escapeRegExp(pattern)}(?=\\s|$|[.,;:])`, 'i').test(text));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findEvidence(sourceText: string, phrases: string[]) {
  const evidence = phrases.flatMap((phrase) => {
    const exact = sourceText.match(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i'));
    if (exact?.[0]) {
      return [exact[0]];
    }

    if (phrase.endsWith('api')) {
      const plural = sourceText.match(new RegExp(`\\b${escapeRegExp(phrase)}s\\b`, 'i'));
      return plural?.[0] ? [plural[0]] : [];
    }

    return [];
  });

  return unique(evidence).slice(0, 4);
}

function stripNonRequirementSections(jobDescriptionText: string) {
  const lines = jobDescriptionText.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const normalizedLine = normalizeText(line).trim();
    const isHeading = line.trim().length < 80 && !/[.!?]$/.test(line.trim());

    if (isHeading && includesAny(normalizedLine, NON_REQUIREMENT_HEADINGS)) {
      skipping = true;
      continue;
    }

    if (skipping && isHeading && includesAny(normalizedLine, [...REQUIRED_HEADINGS, ...OPTIONAL_HEADINGS])) {
      skipping = false;
    }

    if (!skipping) {
      kept.push(line);
    }
  }

  return kept.join('\n');
}

function splitRequirementText(jobDescriptionText: string) {
  const relevantText = stripNonRequirementSections(jobDescriptionText);
  const lines = relevantText.split(/\r?\n/);
  const requiredLines: string[] = [];
  const optionalLines: string[] = [];
  let section: 'required' | 'optional' | 'general' = 'general';

  for (const line of lines) {
    const normalizedLine = normalizeText(line).trim();
    const isHeading = line.trim().length < 100 && !/[.!?]$/.test(line.trim());
    const inlineOptionalMatch = line.match(SOFT_REQUIREMENT_LANGUAGE);
    const inlineOptionalIndex = inlineOptionalMatch?.index;

    if (inlineOptionalIndex !== undefined) {
      const requiredPart = line.slice(0, inlineOptionalIndex).trim();
      const optionalPart = line.slice(inlineOptionalIndex).trim();

      if (requiredPart) {
        requiredLines.push(requiredPart);
      }

      if (optionalPart) {
        optionalLines.push(optionalPart);
      }

      section = 'optional';
      continue;
    }

    if (isHeading && includesAny(normalizedLine, OPTIONAL_HEADINGS)) {
      section = 'optional';
      optionalLines.push(line);
      continue;
    }

    if (isHeading && includesAny(normalizedLine, REQUIRED_HEADINGS)) {
      section = 'required';
      requiredLines.push(line);
      continue;
    }

    if (section === 'optional') {
      optionalLines.push(line);
    } else {
      requiredLines.push(line);
    }
  }

  return {
    relevantText,
    requiredText: requiredLines.join('\n'),
    optionalText: optionalLines.join('\n'),
  };
}

function getSkillMatch(signal: SkillSignal, resumeText: string, normalizedResume: string): SkillMatch {
  const directEvidence = findEvidence(resumeText, signal.aliases);
  const relatedEvidence = findEvidence(resumeText, signal.related ?? []);
  const hasDirect = signal.aliases.some((alias) => normalizedResume.includes(alias));
  const hasRelated = (signal.related ?? []).some((alias) => normalizedResume.includes(alias));

  if (hasDirect && directEvidence.length > 0) {
    return { signal, matched: true, strength: 1, evidence: directEvidence };
  }

  if (hasRelated && relatedEvidence.length > 0) {
    return { signal, matched: true, strength: 0.85, evidence: relatedEvidence };
  }

  return { signal, matched: false, strength: 0, evidence: [] };
}

function getRequiredAndOptionalSkills(requiredText: string, optionalText: string) {
  const required = SKILL_SIGNALS.filter(
    (signal) => includesAny(requiredText, signal.aliases) || includesAny(requiredText, signal.related ?? []),
  );
  const optional = SKILL_SIGNALS.filter(
    (signal) =>
      !required.includes(signal) &&
      (includesAny(optionalText, signal.aliases) || includesAny(optionalText, signal.related ?? [])),
  );

  return { required, optional };
}

function detectRoleTypes(text: string) {
  return ROLE_TYPES.filter((role) => includesAny(text, role.patterns)).map((role) => role.type);
}

function getSkillWeight(signal: SkillSignal, roleTypes: RoleType[]) {
  const isImplementationRole = roleTypes.includes('Implementation engineer');
  const isFrontendOrFullStack = roleTypes.includes('Frontend') || roleTypes.includes('Full stack');

  if (!isImplementationRole) {
    return 1;
  }

  if (signal.categories.includes('implementation')) {
    return 1.45;
  }

  if (
    signal.categories.includes('backend') ||
    signal.categories.includes('database') ||
    signal.categories.includes('scripting') ||
    signal.categories.includes('quality') ||
    signal.categories.includes('architecture')
  ) {
    return 1.3;
  }

  if (signal.categories.includes('devops')) {
    return 1.15;
  }

  if (signal.categories.includes('frontend') && !isFrontendOrFullStack) {
    return 0.45;
  }

  return 1;
}

function getWeightedSkillScore(items: SkillMatch[], roleTypes: RoleType[]) {
  if (items.length === 0) {
    return null;
  }

  const weighted = items.reduce(
    (totals, item) => {
      const weight = getSkillWeight(item.signal, roleTypes);
      return {
        score: totals.score + item.strength * weight,
        weight: totals.weight + weight,
      };
    },
    { score: 0, weight: 0 },
  );

  return weighted.weight ? weighted.score / weighted.weight : 0;
}

function scoreRoleFit(roleTypes: RoleType[], matches: SkillMatch[]) {
  if (roleTypes.length === 0) {
    return 0.65;
  }

  const hasMatch = (label: string) => matches.some((item) => item.signal.label === label && item.matched);
  const hasCategory = (category: string) =>
    matches.some((item) => item.matched && item.signal.categories.includes(category));

  const roleScores = roleTypes.map((roleType) => {
    if (roleType === 'Implementation engineer') {
      const foundations = [
        hasMatch('API/backend experience'),
        hasMatch('Implementation/integrations'),
        hasMatch('SQL/database experience'),
        hasCategory('scripting'),
        hasMatch('Docker'),
        hasCategory('quality'),
        hasCategory('architecture'),
      ].filter(Boolean).length;
      const customerSignal = hasMatch('Customer-facing implementation work') ? 1 : 0;
      return Math.min(1, foundations * 0.13 + customerSignal * 0.16 + 0.2);
    }

    if (roleType === 'Backend') {
      return hasMatch('API/backend experience') || hasMatch('Python') || hasMatch('Java') ? 1 : 0.35;
    }

    if (roleType === 'Full stack') {
      const backend = hasMatch('API/backend experience') || hasMatch('Python') || hasMatch('Java');
      const frontend = hasMatch('React/frontend') || hasMatch('JavaScript/TypeScript');
      return backend && frontend ? 1 : backend || frontend ? 0.65 : 0.3;
    }

    if (roleType === 'Frontend') {
      return hasMatch('React/frontend') || hasMatch('JavaScript/TypeScript') ? 1 : 0.35;
    }

    if (roleType === 'DevOps/SRE') {
      return hasMatch('Docker') || hasMatch('AWS') || hasMatch('GitHub Actions / CI/CD') || hasMatch('Terraform') ? 0.85 : 0.25;
    }

    return hasCategory('leadership') ? 1 : 0.25;
  });

  return roleScores.reduce((sum, value) => sum + value, 0) / roleScores.length;
}

function scoreSeniorityFit(jobText: string, resumeText: string) {
  const seniorRole = includesAny(jobText, ['senior', 'staff', 'principal', 'lead engineer', '7+ years', '8+ years']);
  const midRole = includesAny(jobText, ['3+ years', '4+ years', '5+ years']);
  const earlyRole = includesAny(jobText, EARLY_CAREER_PATTERNS);

  if (seniorRole) {
    return includesAny(resumeText, ['senior', 'lead', 'staff', 'principal', 'architect', 'mentored', 'owned']) ? 1 : 0.25;
  }

  if (earlyRole) {
    return 1;
  }

  if (midRole) {
    return includesAny(resumeText, ['2 years', '3 years', '4 years', '5 years', 'professional', 'production']) ? 0.9 : 0.65;
  }

  return 0.8;
}

function scoreKeywordFit(resumeText: string, relevantJobText: string) {
  const resumeKeywords = extractKeywords(resumeText);
  const jobKeywords = extractKeywords(relevantJobText);
  const resumeSet = new Set(resumeKeywords);
  const keywordMatches = jobKeywords.filter((keyword) => resumeSet.has(keyword));

  return jobKeywords.length ? keywordMatches.length / jobKeywords.length : 0;
}

function getApplicantCount(text: string) {
  const applicantMatch = text.match(/(\d{1,4})\+?\s*applicants?/);
  return applicantMatch ? Number(applicantMatch[1]) : null;
}

function getDaysSincePosted(text: string) {
  if (text.includes('today') || text.includes('just posted')) {
    return 0;
  }

  const dayMatch = text.match(/(\d{1,3})\s*days?\s*ago/);
  if (dayMatch) {
    return Number(dayMatch[1]);
  }

  const weekMatch = text.match(/(\d{1,2})\s*weeks?\s*ago/);
  return weekMatch ? Number(weekMatch[1]) * 7 : null;
}

function getRequiredYears(text: string) {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const years = sentences.flatMap((sentence) => {
    const hasRequirementContext =
      /\b(required|requires|requirement|requirements|minimum|minimum qualifications|qualifications|must have|must-have|you have|need|needed|looking for|candidate|applicant|experience required|professional experience|software engineering experience|software development experience|developer experience|engineering experience)\b/i.test(
        sentence,
      );

    if (!hasRequirementContext) {
      return [];
    }

    return Array.from(sentence.matchAll(/\b(\d{1,2})\+?\s*(?:\+|plus)?\s*(?:years?|yrs?)\b/gi)).map((match) =>
      Number(match[1]),
    );
  });

  return years.length ? Math.max(...years) : null;
}

function getResumeYears(text: string) {
  const yearMatches = Array.from(text.matchAll(/(\d{1,2})\+?\s*(?:years?|yrs?)/g)).map((match) => Number(match[1]));
  return yearMatches.length ? Math.max(...yearMatches) : null;
}

const EDUCATION_LEVELS = {
  bachelor: 1,
  master: 2,
  phd: 3,
} as const;

function getEducationLevelLabel(level: number | null) {
  if (level === EDUCATION_LEVELS.phd) return 'PhD';
  if (level === EDUCATION_LEVELS.master) return "Master's";
  if (level === EDUCATION_LEVELS.bachelor) return "Bachelor's";
  return null;
}

function getEducationLevelFromText(text: string) {
  if (/\b(ph\.?\s*d\.?|doctorate|doctoral degree)\b/i.test(text)) {
    return EDUCATION_LEVELS.phd;
  }

  if (/\b(m\.?\s*s\.?|m\.?\s*eng\.?|master'?s?|masters|master of science|master of engineering|mba)\b/i.test(text)) {
    return EDUCATION_LEVELS.master;
  }

  if (/\b(b\.?\s*s\.?|b\.?\s*a\.?|bachelor'?s?|bachelors|bachelor of science|bachelor of arts)\b/i.test(text)) {
    return EDUCATION_LEVELS.bachelor;
  }

  return null;
}

function getRequiredEducationLevel(requiredText: string) {
  if (!includesAny(requiredText, REQUIRED_HEADINGS)) {
    return null;
  }

  return getEducationLevelFromText(requiredText);
}

function getResumeEducationLevel(resumeText: string) {
  return getEducationLevelFromText(resumeText);
}

function getEducationRequirementGap(requiredText: string, resumeText: string) {
  const requiredEducationLevel = getRequiredEducationLevel(requiredText);
  const resumeEducationLevel = getResumeEducationLevel(resumeText);

  if (requiredEducationLevel === null) {
    return null;
  }

  if (resumeEducationLevel !== null && resumeEducationLevel >= requiredEducationLevel) {
    return null;
  }

  const label = getEducationLevelLabel(requiredEducationLevel);
  return label ? `${label} degree required` : null;
}

function getEducationScoreCap(requiredText: string, resumeText: string) {
  const requiredEducationLevel = getRequiredEducationLevel(requiredText);
  const resumeEducationLevel = getResumeEducationLevel(resumeText);

  if (requiredEducationLevel === null || (resumeEducationLevel !== null && resumeEducationLevel >= requiredEducationLevel)) {
    return null;
  }

  if (requiredEducationLevel === EDUCATION_LEVELS.phd) {
    return resumeEducationLevel === EDUCATION_LEVELS.master ? 5.0 : 3.9;
  }

  return 6.5;
}

function getEducationInterviewChance(requiredText: string, resumeText: string) {
  const requiredEducationLevel = getRequiredEducationLevel(requiredText);
  const resumeEducationLevel = getResumeEducationLevel(resumeText);

  if (requiredEducationLevel === null || (resumeEducationLevel !== null && resumeEducationLevel >= requiredEducationLevel)) {
    return null;
  }

  if (requiredEducationLevel === EDUCATION_LEVELS.phd) {
    return resumeEducationLevel === EDUCATION_LEVELS.master ? '1-3%' : '<1%';
  }

  return '1-2%';
}

function isEarlyCareerResume(text: string) {
  const resumeYears = getResumeYears(text);
  const seniorSignals = ['senior', 'staff', 'principal', 'lead', 'manager', 'architect', '7+ years', '8+ years'];
  const earlyCareerSignals = [
    'intern',
    'internship',
    'new grad',
    'new graduate',
    'recent graduate',
    'student',
    'capstone',
    'bootcamp',
    'junior',
    'entry-level',
    'entry level',
    'project',
    'projects',
    'contract',
  ];

  if (includesAny(text, seniorSignals)) {
    return false;
  }

  if (resumeYears !== null) {
    return resumeYears <= 2;
  }

  return includesAny(text, earlyCareerSignals);
}

function hasStrongEarlyCareerEvidence(text: string) {
  return includesAny(text, [
    'intern',
    'internship',
    'contract',
    'freelance',
    'production',
    'deployed',
    'client',
    'customer',
    'project',
    'projects',
    'capstone',
  ]);
}

function hasEvidenceForAny(resumeText: string, phrases: string[]) {
  return phrases.some((phrase) => new RegExp(`(^|\\s)${escapeRegExp(phrase)}(?=\\s|$|[.,;:])`, 'i').test(resumeText));
}

function hasAlternativeRequirementCue(text: string) {
  return /\b(or|and\s+or|one of|either|such as|e\.g)\b/i.test(text);
}

function splitRequirementClauses(text: string) {
  return text
    .split(/[\n.;]+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function getMentionedAlternativeTechnologies(text: string) {
  return ALTERNATIVE_TECHNOLOGIES.filter((technology) => hasEvidenceForAny(text, technology.phrases));
}

function getSatisfiedAlternativeGroups(requiredText: string, resumeText: string) {
  return splitRequirementClauses(requiredText)
    .filter(hasAlternativeRequirementCue)
    .map(getMentionedAlternativeTechnologies)
    .filter((group) => group.length >= 2)
    .filter((group) => group.some((technology) => hasEvidenceForAny(resumeText, technology.phrases)));
}

function isSatisfiedAlternativeTechnology(phrases: string[], satisfiedAlternativeGroups: AlternativeTechnology[][]) {
  return satisfiedAlternativeGroups.some((group) =>
    group.some((technology) =>
      technology.phrases.some((alternativePhrase) =>
        phrases.some(
          (phrase) =>
            phrase.toLowerCase() === alternativePhrase.toLowerCase(),
        ),
      ),
    ),
  );
}

function isSatisfiedAlternativeSkillSignal(signal: SkillSignal, satisfiedAlternativeGroups: AlternativeTechnology[][]) {
  return isSatisfiedAlternativeTechnology(
    [...signal.aliases, ...(signal.related ?? [])],
    satisfiedAlternativeGroups,
  );
}

function getCriticalRequirementGaps(requiredText: string, resumeText: string) {
  const gaps: string[] = [];
  const requiredYears = getRequiredYears(requiredText);
  const resumeYears = getResumeYears(resumeText);
  const satisfiedAlternativeGroups = getSatisfiedAlternativeGroups(requiredText, resumeText);
  const criticalLanguageSignals = [
    { label: 'Java/Spring Boot/Microservices', phrases: ['java', 'spring', 'spring boot', 'microservices', 'microservice'] },
    { label: 'Python', phrases: ['python', 'fastapi', 'django', 'flask'] },
    { label: 'JavaScript/TypeScript', phrases: ['javascript', 'typescript', 'node'] },
    { label: 'C# / .NET', phrases: ['c#', '.net', 'asp.net core'] },
    { label: 'Go', phrases: ['go', 'golang'] },
    { label: 'Ruby', phrases: ['ruby', 'rails'] },
  ];
  const criticalDomainSignals = [
    {
      label: 'Trading systems or financial services domain',
      phrases: [
        'trading system',
        'trading systems',
        'trading platform',
        'trading platforms',
        'capital markets',
        'financial markets',
        'financial services',
        'us equities',
        'equity trading',
        'options trading',
      ],
    },
    { label: 'Healthcare domain experience', phrases: ['healthcare', 'health care', 'hipaa', 'clinical', 'medicaid', 'medicare'] },
    { label: 'Payments domain experience', phrases: ['payments', 'payment processing', 'fintech'] },
    { label: 'Government domain experience', phrases: ['government domain', 'public sector', 'federal systems', 'federal contracting'] },
  ];
  const criticalProductionSignals = [
    {
      label: 'Low-latency / high-throughput production systems',
      phrases: [
        'low-latency production',
        'low latency production',
        'low-latency systems',
        'low latency systems',
        'high-throughput production',
        'high throughput production',
        'high-throughput systems',
        'high throughput systems',
        'linux production systems',
      ],
    },
    {
      label: 'Real-time systems experience',
      phrases: ['real-time systems', 'real time systems', 'real-time server', 'real time server'],
    },
    {
      label: 'Production systems experience',
      phrases: ['production experience', 'production systems', 'production environment', 'production backend'],
    },
  ];
  const criticalSpecializedSignals = [
    { label: 'Distributed systems at scale', phrases: ['distributed systems at scale', 'large-scale distributed systems'] },
    { label: 'Embedded systems experience', phrases: ['embedded systems', 'embedded software', 'firmware'] },
    { label: 'Machine learning research experience', phrases: ['machine learning research', 'ml research'] },
    { label: 'Mainframe / DB2 experience', phrases: ['mainframe', 'db2', 'cobol'] },
    { label: 'Legacy-to-cloud migration experience', phrases: ['legacy-to-cloud', 'legacy to cloud', 'cloud migration', 'modernization'] },
  ];

  if (requiredYears !== null && (resumeYears === null || resumeYears < requiredYears)) {
    gaps.push(`${requiredYears}+ years professional software development experience`);
  }

  if (hasEvidenceForAny(requiredText, ['ios', 'swift', 'swiftui', 'uikit'])) {
    if (!hasEvidenceForAny(resumeText, ['ios', 'iphone', 'ipad', 'swift', 'swiftui', 'uikit'])) {
      gaps.push('Professional iOS development experience');
    }
  }

  if (hasEvidenceForAny(requiredText, ['real-time server-side java', 'real time server-side java', 'real-time server side java', 'real time server side java'])) {
    if (!hasEvidenceForAny(resumeText, ['real-time server-side java', 'real time server-side java', 'real-time server side java', 'real time server side java'])) {
      gaps.push('Real-time server-side Java');
    }
  }

  criticalLanguageSignals.forEach((language) => {
    const requiredLanguage = hasEvidenceForAny(requiredText, language.phrases);
    const hasLanguageEvidence = hasEvidenceForAny(resumeText, language.phrases);
    const satisfiedByAlternative = isSatisfiedAlternativeTechnology(language.phrases, satisfiedAlternativeGroups);
    const alreadyCoveredByYearsGap = gaps.some((gap) => gap.includes(language.label));
    const alreadyCoveredBySpecializedGap = language.label === 'Java' && gaps.includes('Real-time server-side Java');

    if (
      requiredLanguage &&
      !hasLanguageEvidence &&
      !satisfiedByAlternative &&
      !alreadyCoveredByYearsGap &&
      !alreadyCoveredBySpecializedGap
    ) {
      gaps.push(`${language.label} experience`);
    }
  });

  criticalDomainSignals.forEach((domain) => {
    if (hasEvidenceForAny(requiredText, domain.phrases) && !hasEvidenceForAny(resumeText, domain.phrases)) {
      gaps.push(domain.label);
    }
  });

  if (hasEvidenceForAny(requiredText, ['security clearance', 'clearance required', 'active clearance', 'secret clearance'])) {
    if (!hasEvidenceForAny(resumeText, ['security clearance', 'active clearance', 'secret clearance', 'top secret'])) {
      gaps.push('Required security clearance');
    }
  }

  criticalProductionSignals.forEach((signal) => {
    if (
      signal.label === 'Production systems experience' &&
      (gaps.includes('Low-latency / high-throughput production systems') || gaps.includes('Real-time systems experience'))
    ) {
      return;
    }

    if (hasEvidenceForAny(requiredText, signal.phrases) && !hasEvidenceForAny(resumeText, signal.phrases)) {
      gaps.push(signal.label);
    }
  });

  criticalSpecializedSignals.forEach((signal) => {
    if (hasEvidenceForAny(requiredText, signal.phrases) && !hasEvidenceForAny(resumeText, signal.phrases)) {
      gaps.push(signal.label);
    }
  });

  return unique(gaps);
}

function getSpecializedGaps(requiredText: string, resumeText: string) {
  return SPECIALIZED_REQUIREMENTS.filter(
    (requirement) =>
      hasEvidenceForAny(requiredText, requirement.phrases) && !hasEvidenceForAny(resumeText, requirement.phrases),
  ).map((requirement) => requirement.label);
}

function isPlatformIdentityRole(
  jobText: string,
  role: (typeof PLATFORM_IDENTITY_ROLES)[number],
) {
  const directRoleMatch = role.rolePatterns
    .filter((pattern) => pattern !== 'mobile engineer')
    .some((pattern) => hasEvidenceForAny(jobText, [pattern]));
  const mobileRoleMatch =
    hasEvidenceForAny(jobText, ['mobile engineer']) &&
    hasEvidenceForAny(jobText, [...role.platform.phrases, ...role.language.phrases, ...role.framework.phrases]);

  return directRoleMatch || mobileRoleMatch;
}

function getPlatformIdentityGaps(jobText: string, resumeText: string) {
  const platformRole = PLATFORM_IDENTITY_ROLES.find((role) => isPlatformIdentityRole(jobText, role));

  if (!platformRole) {
    return [];
  }

  const hasPlatformEvidence = hasEvidenceForAny(resumeText, [
    ...platformRole.platform.phrases,
    ...platformRole.language.phrases,
    ...platformRole.framework.phrases,
  ]);

  if (hasPlatformEvidence) {
    return [];
  }

  return [
    platformRole.platform.label,
    platformRole.language.label,
    platformRole.framework.label,
    ...(platformRole.additionalGaps ?? []).map((gap) => gap.label),
  ];
}

function hasSpecializedCriticalRequirement(requiredText: string) {
  return includesAny(requiredText, [
    'trading systems',
    'trading platform',
    'trading platforms',
    'low latency',
    'low-latency',
    'real time',
    'real-time',
    'high throughput',
    'high-throughput',
    'embedded systems',
    'security clearance',
    'active clearance',
    'machine learning research',
    'ml research',
    'distributed systems at scale',
    'large-scale distributed systems',
  ]);
}

function hasSpecializedCriticalResumeEvidence(resumeText: string) {
  return includesAny(resumeText, [
    'trading systems',
    'trading platform',
    'trading platforms',
    'financial services',
    'equities',
    'options',
    'low latency',
    'low-latency',
    'real time',
    'real-time',
    'high throughput',
    'high-throughput',
    'embedded systems',
    'security clearance',
    'active clearance',
    'machine learning research',
    'ml research',
    'distributed systems at scale',
    'large-scale distributed systems',
  ]);
}

function getScoreCap(
  requiredText: string,
  resumeText: string,
  criticalGapCount: number,
  specializedGapCount: number,
  platformIdentityGapCount: number,
) {
  const requiredYears = getRequiredYears(requiredText);
  const earlyCareer = isEarlyCareerResume(resumeText);
  const specializedRequirement = hasSpecializedCriticalRequirement(requiredText);
  const specializedEvidence = hasSpecializedCriticalResumeEvidence(resumeText);
  const caps: number[] = [];

  if (platformIdentityGapCount > 0) {
    caps.push(3.5);
  }

  if (specializedGapCount > 0) {
    caps.push(4);
  }

  if (requiredYears !== null && requiredYears >= 15 && earlyCareer) {
    caps.push(1.5);
  } else if (requiredYears !== null && requiredYears >= 10 && earlyCareer) {
    caps.push(2);
  } else if (requiredYears !== null && requiredYears >= 8 && earlyCareer) {
    caps.push(2.5);
  } else if (requiredYears !== null && requiredYears >= 5 && earlyCareer) {
    caps.push(3.5);
  } else if (requiredYears !== null && requiredYears >= 3 && earlyCareer) {
    caps.push(5.9);
  }

  if (requiredYears !== null && requiredYears >= 10 && specializedRequirement && !specializedEvidence) {
    caps.push(1.5);
  }

  if (requiredYears !== null && requiredYears >= 5 && specializedRequirement && !specializedEvidence) {
    caps.push(3.5);
  }

  if (requiredYears !== null && requiredYears <= 2 && earlyCareer && hasStrongEarlyCareerEvidence(resumeText)) {
    return null;
  }

  if (criticalGapCount >= 2) {
    caps.push(5);
  }

  return caps.length ? Math.min(...caps) : null;
}

function getMarketContext(jobText: string, seniorityFitScore: number) {
  const applicantCount = getApplicantCount(jobText);
  const daysSincePosted = getDaysSincePosted(jobText);
  const requiredYears = getRequiredYears(jobText);
  const isRemote = includesAny(jobText, ['remote', 'work from home', 'distributed']);
  const isHybrid = includesAny(jobText, ['hybrid']);
  const isOnsite = includesAny(jobText, ['on-site', 'onsite', 'in office']);
  const isEasyApply = includesAny(jobText, ['easy apply', 'quick apply', 'one click apply', '1-click apply']);
  const hasReferralSignal = includesAny(jobText, ['referral', 'referred', 'connection', 'employee referral']);
  const hasStrongCompanyCompetition = includesAny(jobText, [
    'highly competitive',
    'well-funded',
    'top startup',
    'yc',
    'y combinator',
    'series a',
    'series b',
    'series c',
    'fast-growing',
    'fast growing',
  ]);

  let competitionPoints = 0;
  const factors: string[] = [];
  const chanceReasons: string[] = [];

  if (isRemote) {
    competitionPoints += 2;
    factors.push('Remote');
    chanceReasons.push('Remote role');
  } else if (isHybrid) {
    competitionPoints += 1;
    factors.push('Hybrid');
    chanceReasons.push('Hybrid role');
  } else if (isOnsite) {
    competitionPoints -= 1;
    factors.push('Onsite');
  }

  if (isEasyApply) {
    competitionPoints += 2;
    factors.push('Easy Apply');
    chanceReasons.push('Easy Apply');
  }

  if (applicantCount !== null) {
    if (applicantCount >= 100) {
      competitionPoints += 3;
      factors.push('100+ Applicants');
      chanceReasons.push('100+ applicants');
    } else if (applicantCount >= 50) {
      competitionPoints += 2;
      factors.push(`${applicantCount}+ Applicants`);
      chanceReasons.push(`${applicantCount}+ applicants`);
    } else if (applicantCount >= 25) {
      competitionPoints += 1;
      factors.push(`${applicantCount}+ Applicants`);
    }
  }

  if (daysSincePosted !== null && daysSincePosted >= 7) {
    competitionPoints += 1;
    factors.push('Older posting');
    chanceReasons.push('Posted for a week or more');
  }

  if (seniorityFitScore < 0.6 || (requiredYears !== null && requiredYears >= 5 && seniorityFitScore < 0.8)) {
    competitionPoints += 1;
    factors.push('Seniority mismatch risk');
    chanceReasons.push('Seniority or required-years mismatch');
  }

  if (hasStrongCompanyCompetition) {
    competitionPoints += 1;
    factors.push('Strong company competition');
    chanceReasons.push('Strong company competition signals');
  }

  if (hasReferralSignal) {
    competitionPoints -= 1;
    factors.push('Referral or connection signal');
  }

  const marketCompetition =
    competitionPoints >= 6 ? 'Very High' : competitionPoints >= 4 ? 'High' : competitionPoints >= 2 ? 'Medium' : 'Low';

  if (marketCompetition === 'Very High') {
    chanceReasons.push('Very high competition');
  } else if (marketCompetition === 'High') {
    chanceReasons.push('High competition');
  }

  return {
    marketCompetition,
    factors: factors.length ? factors : ['No major competition flags detected'],
    chanceReasons: chanceReasons.length ? unique(chanceReasons) : ['No major market competition penalty detected'],
  } as const;
}

function getEstimatedInterviewChance(score: number, marketCompetition: AnalysisResult['marketCompetition']) {
  if (score <= 1.5) {
    return '<1%';
  }

  if (score < 4) {
    return '<1-2%';
  }

  if (score < 6) {
    return marketCompetition === 'Low' || marketCompetition === 'Medium' ? '1-2%' : '<1-2%';
  }

  if (score < 8) {
    if (marketCompetition === 'Very High') {
      return '1-3%';
    }

    if (marketCompetition === 'High') {
      return '1-4%';
    }

    if (marketCompetition === 'Medium') {
      return '3-6%';
    }

    return '5-10%';
  }

  if (marketCompetition === 'Very High') {
    return score >= 8.5 ? '3-8%' : '2-6%';
  }

  if (marketCompetition === 'High') {
    return '3-8%';
  }

  if (marketCompetition === 'Medium') {
    return '6-12%';
  }

  return '10-20%';
}

function getInterviewChanceCapRank(interviewChance: string) {
  const value = String(interviewChance ?? '');
  const matches = [...value.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));

  if (matches.length === 0) {
    return value.includes('<') ? 1 : null;
  }

  return Math.max(...matches);
}

function capInterviewChance(interviewChance: string, cap: string) {
  const currentRank = getInterviewChanceCapRank(interviewChance);
  const capRank = getInterviewChanceCapRank(cap);

  if (currentRank === null || capRank === null) {
    return interviewChance;
  }

  return currentRank > capRank ? cap : interviewChance;
}

function classifyEmployerType(jobText: string): AnalysisResult['companyType'] {
  if (
    includesAny(jobText, [
      'stealth startup',
      'confidential company',
      'no company identity',
      'company confidential',
    ]) ||
    (/unrealistic compensation|minimal company information|generic responsibilities/i.test(jobText) &&
      !includesAny(jobText, ['product', 'platform', 'team', 'customer']))
  ) {
    return 'Suspicious Posting';
  }

  if (
    includesAny(jobText, [
      'crossing hurdles',
      'dice',
      'recruiter',
      'recruiting firm',
      'recruiting agency',
      'staffing agency',
      'staffing partner',
      'staffing firm',
      'contract placement',
      'placement firm',
      'posting for a client',
      'client is seeking',
      'our client',
    ])
  ) {
    return 'Staffing Agency';
  }

  if (
    includesAny(jobText, [
      'talent network',
      'talent community',
      'join our network',
      'future opportunities',
      'matching platform',
      'candidate marketplace',
      'talent pool',
      'build your profile',
      'create candidate account',
      'future matching opportunities',
      'workerbee',
    ])
  ) {
    return 'Talent Network';
  }

  if (includesAny(jobText, ['consulting', 'client services', 'implementation partner'])) {
    return 'Consulting';
  }

  if (includesAny(jobText, ['startup', 'seed stage', 'series a', 'series b'])) {
    return 'Startup';
  }

  return 'Direct Employer';
}

function getOpportunityQuality(companyType: AnalysisResult['companyType']): AnalysisResult['opportunityQuality'] {
  if (
    companyType === 'Staffing Agency' ||
    companyType === 'Suspicious Posting' ||
    companyType === 'Talent Network'
  ) {
    return 'Medium';
  }
  return 'High';
}

function adjustInterviewChanceForEmployerType(
  interviewChance: string,
  companyType: AnalysisResult['companyType'],
) {
  if (companyType === 'Staffing Agency') return capInterviewChance(interviewChance, '5-10%');
  if (companyType === 'Talent Network') return capInterviewChance(interviewChance, '3-7%');
  if (companyType === 'Suspicious Posting') return capInterviewChance(interviewChance, '3-7%');
  return interviewChance;
}

function getEmployerTypeReasoning(companyType: AnalysisResult['companyType']) {
  if (companyType === 'Staffing Agency') {
    return 'The staffing/recruiting layer lowers conversion odds because the resume usually has to pass an agency screen before reaching the client.';
  }

  if (companyType === 'Talent Network') {
    return 'The candidate pool or marketplace model lowers conversion odds because matching to a real hiring-manager screen is an extra step.';
  }

  if (companyType === 'Suspicious Posting') {
    return 'Posting quality and credibility concerns lower expected conversion even though the resume-to-role fit is scored separately.';
  }

  return '';
}

function getStrongMatchPriority(label: string, roleTypes: RoleType[]) {
  if (!roleTypes.includes('Implementation engineer')) {
    return 0;
  }

  const priorities = [
    'API/backend experience',
    'Implementation/integrations',
    'SQL/database experience',
    'Docker',
    'Automated testing',
    'System architecture',
    'GitHub Actions / CI/CD',
    'Bash',
    'Customer-facing implementation work',
  ];
  const index = priorities.findIndex((priority) => label.startsWith(priority));
  return index === -1 ? priorities.length : index;
}

function getStrongMatches(matches: SkillMatch[], roleTypes: RoleType[]): StrongMatch[] {
  return matches
    .filter((item) => item.matched && item.evidence.length > 0)
    .filter((item) => {
      const frontendOnly = item.signal.categories.includes('frontend') && !roleTypes.includes('Frontend') && !roleTypes.includes('Full stack');
      return !(roleTypes.includes('Implementation engineer') && frontendOnly);
    })
    .sort((a, b) => getStrongMatchPriority(a.signal.label, roleTypes) - getStrongMatchPriority(b.signal.label, roleTypes))
    .map((item) => ({ label: item.signal.label }))
    .slice(0, 5);
}

export function analyzeMatch(resumeText: string, jobDescriptionText: string): AnalysisResult {
  const normalizedResume = normalizeText(resumeText);
  const normalizedJob = normalizeText(jobDescriptionText);
  const { relevantText, requiredText, optionalText } = splitRequirementText(jobDescriptionText);
  const normalizedRelevantJob = normalizeText(relevantText);
  const normalizedRequired = normalizeText(requiredText);
  const normalizedOptional = normalizeText(optionalText);
  const learningFriendly = includesAny(normalizedJob, LEARNING_FRIENDLY_PATTERNS);

  const { required, optional } = getRequiredAndOptionalSkills(normalizedRequired, normalizedOptional);
  const satisfiedAlternativeGroups = getSatisfiedAlternativeGroups(normalizedRequired, normalizedResume);
  const scoringRequired = required.filter(
    (signal) =>
      getSkillMatch(signal, resumeText, normalizedResume).matched ||
      !isSatisfiedAlternativeSkillSignal(signal, satisfiedAlternativeGroups),
  );
  const roleTypes = detectRoleTypes(normalizedRelevantJob);
  const requiredSkillMatches = scoringRequired.map((signal) => getSkillMatch(signal, resumeText, normalizedResume));
  const optionalSkillMatches = optional.map((signal) => getSkillMatch(signal, resumeText, normalizedResume));
  const allSkillMatches = [...requiredSkillMatches, ...optionalSkillMatches];

  const requiredSkillScore = getWeightedSkillScore(requiredSkillMatches, roleTypes) ?? 0.75;
  const optionalSkillScore = getWeightedSkillScore(optionalSkillMatches, roleTypes) ?? 0.7;
  const roleFitScore = scoreRoleFit(roleTypes, allSkillMatches);
  const seniorityFitScore = scoreSeniorityFit(normalizedRelevantJob, normalizedResume);
  const earlyCareerFitScore = includesAny(normalizedRelevantJob, EARLY_CAREER_PATTERNS) ? 1 : 0.65;
  const keywordScore = scoreKeywordFit(normalizedResume, normalizedRelevantJob);

  const missingRequired = requiredSkillMatches.filter((item) => !item.matched);
  const missingLanguageCount = missingRequired.filter((item) => item.signal.categories.includes('language')).length;
  const missingPenaltyRelief = learningFriendly ? Math.min(0.5, missingLanguageCount * 0.2) : 0;

  const uncappedScore = clampScore(
    requiredSkillScore * 3.2 +
      optionalSkillScore * 0.8 +
      roleFitScore * 2 +
      seniorityFitScore * 2 +
      earlyCareerFitScore * 0.8 +
      keywordScore * 1.2 +
      missingPenaltyRelief,
  );
  const educationGap = getEducationRequirementGap(requiredText, resumeText);
  const criticalGaps = unique([
    ...getCriticalRequirementGaps(normalizedRequired, normalizedResume),
    ...(educationGap ? [educationGap] : []),
  ]);
  const platformIdentityGaps = getPlatformIdentityGaps(normalizedRelevantJob, normalizedResume);
  const platformIdentitySummary = platformIdentityGaps.join(' ');
  const additionalSpecializedGaps = getSpecializedGaps(normalizedRequired, normalizedResume).filter(
    (gap) => !platformIdentitySummary.includes(gap),
  );
  const specializedGaps = unique([...platformIdentityGaps, ...additionalSpecializedGaps]);
  const scoreCap = getScoreCap(
    normalizedRequired,
    normalizedResume,
    criticalGaps.length,
    specializedGaps.length,
    platformIdentityGaps.length,
  );
  const educationScoreCap = getEducationScoreCap(requiredText, resumeText);
  const combinedScoreCap = [scoreCap, educationScoreCap].filter((value): value is number => value !== null);
  const score = combinedScoreCap.length ? Math.min(uncappedScore, ...combinedScoreCap) : uncappedScore;
  const marketContext = getMarketContext(normalizedJob, seniorityFitScore);
  const companyType = classifyEmployerType(normalizedJob);
  const opportunityQuality = getOpportunityQuality(companyType);
  const estimatedInterviewChance =
    getEducationInterviewChance(requiredText, resumeText) ??
    adjustInterviewChanceForEmployerType(
      getEstimatedInterviewChance(score, marketContext.marketCompetition),
      companyType,
    );
  const applicationRequirements = extractApplicationRequirements(jobDescriptionText);
  const effortLevel = getEffortLevel(applicationRequirements);
  const strongMatches = getStrongMatches(allSkillMatches, roleTypes);
  const recommendation = getRecommendation(score, {
    applicationRequirements,
    companyType,
    effortLevel,
    interviewChance: estimatedInterviewChance,
    opportunityQuality,
    strongMatchCount: strongMatches.length,
  });

  const missingItems = missingRequired
    .filter((item) => !(learningFriendly && item.signal.categories.includes('language')))
    .filter((item) => !(roleTypes.includes('Implementation engineer') && item.signal.categories.includes('frontend')))
    .sort((a, b) => getSkillWeight(b.signal, roleTypes) - getSkillWeight(a.signal, roleTypes));
  const missingSkills = missingItems
    .filter((item) => item.signal.kind === 'skill')
    .map((item) => item.signal.label)
    .slice(0, 5);
  const missingSignals = missingItems
    .filter((item) => item.signal.kind === 'signal')
    .map((item) => item.signal.label)
    .slice(0, 5);

  const concerns = [];
  if (score < 6) {
    concerns.push('The resume does not yet show enough direct overlap with the role requirements.');
  }
  if (missingSkills.length > 0 || missingSignals.length > 0) {
    concerns.push('Some required skills or experience patterns are not clearly supported by resume evidence.');
  }
  if (criticalGaps.length >= 2) {
    concerns.push('Multiple critical requirements appear missing, so the fit score is capped.');
  }
  if (specializedGaps.length > 0) {
    concerns.push('The JD explicitly requires specialized platform, domain, or tooling experience not shown in the resume.');
  }
  if (platformIdentityGaps.length > 0) {
    concerns.push('The platform is the core identity of the role, but the resume does not show that platform.');
  }
  if (scoreCap !== null && scoreCap <= 3.9) {
    concerns.push('The JD appears to require senior specialized experience that the resume does not show.');
  }
  if (roleTypes.includes('Senior/staff/principal') && seniorityFitScore < 0.8) {
    concerns.push('The role appears senior, but senior ownership or leadership signals are limited.');
  }
  if (resumeText.length < 800) {
    concerns.push('The resume text may be too light on concrete experience, metrics, or project detail.');
  }
  if (marketContext.marketCompetition === 'High' || marketContext.marketCompetition === 'Very High') {
    concerns.push('Market conditions may lower interview odds even though the resume fit is strong.');
  }

  const competitionSummary = marketContext.factors.join(', ');
  const employerTypeReasoning = getEmployerTypeReasoning(companyType);
  const baseReasoning =
    score < 6
      ? `This looks like a weaker fit because the resume is missing enough evidence-backed overlap with the role requirements. Critical requirements are weighted heavily, and multiple critical gaps cap the fit score. Benefits and compensation sections are ignored so the score focuses on job fit. Market competition is ${marketContext.marketCompetition.toLowerCase()} based on ${competitionSummary}.`
      : `This looks like a strong fit because the resume has evidence-backed overlap with the role requirements, seniority expectations, and role type. The interview chance is lower or higher based on market factors separately from fit score; current competition is ${marketContext.marketCompetition.toLowerCase()} based on ${competitionSummary}.`;

  return {
    jobFitScore: score,
    recommendation,
    technicalRecommendation: recommendation,
    technicalReasoning: baseReasoning,
    roiRecommendation: recommendation,
    roiReasoning: baseReasoning,
    estimatedInterviewChance,
    marketCompetition: marketContext.marketCompetition,
    jobLogistics: 'Not specified',
    employmentType: extractEmploymentType(jobDescriptionText) ?? undefined,
    companyType,
    opportunityQuality,
    strongMatches,
    applicationRequirements,
    effortLevel,
    criticalGaps,
    specializedGaps: specializedGaps.length ? specializedGaps : ['No specialized platform/domain gaps detected from the current text'],
    missingSkills: missingSkills.length ? missingSkills : ['No major missing technologies detected from the current text'],
    missingSignals: missingSignals.length ? missingSignals : ['No major missing experience patterns detected from the current text'],
    chanceReasons: employerTypeReasoning
      ? unique([...marketContext.chanceReasons, employerTypeReasoning])
      : marketContext.chanceReasons,
    competitionFactors: marketContext.factors,
    resumeImprovements: [
      'Add concrete evidence bullets for the most important required skills.',
      'Quantify implementation, integration, backend, or database outcomes where possible.',
      'Move the strongest role-specific evidence closer to the top of the resume.',
    ],
    reasoning: employerTypeReasoning ? `${baseReasoning} ${employerTypeReasoning}` : baseReasoning,
  };
}
