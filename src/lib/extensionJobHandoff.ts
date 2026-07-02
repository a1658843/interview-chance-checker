export type LinkedInJobHandoffPayload = {
  source: 'linkedin';
  extractedAt?: string;
  url?: string;
  title?: string;
  company?: string;
  location?: string;
  employmentType?: string;
  workplaceType?: string;
  description: string;
};

export type ExtensionHandoffMessage = {
  type: 'INTERVIEW_CHANCE_CHECKER_LINKEDIN_HANDOFF';
  handoffId?: string;
  payload: LinkedInJobHandoffPayload;
};

type AutoAnalyzeDecisionInput = {
  hasSavedResume: boolean;
  currentJobDescriptionText: string;
  didPopulateJobDescription: boolean;
  alreadyConsumed: boolean;
};

const handoffMessageType = 'INTERVIEW_CHANCE_CHECKER_LINKEDIN_HANDOFF';
const minimumDescriptionLength = 80;

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalLine(label: string, value: unknown) {
  const trimmed = text(value);
  return trimmed ? `${label}: ${trimmed}` : null;
}

export function validateLinkedInJobHandoffPayload(value: unknown): LinkedInJobHandoffPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = value as Partial<LinkedInJobHandoffPayload>;
  const description = text(payload.description);

  if (payload.source !== 'linkedin' || description.length < minimumDescriptionLength) {
    return null;
  }

  return {
    source: 'linkedin',
    extractedAt: text(payload.extractedAt) || undefined,
    url: text(payload.url) || undefined,
    title: text(payload.title) || undefined,
    company: text(payload.company) || undefined,
    location: text(payload.location) || undefined,
    employmentType: text(payload.employmentType) || undefined,
    workplaceType: text(payload.workplaceType) || undefined,
    description,
  };
}

export function parseExtensionHandoffMessage(value: unknown): ExtensionHandoffMessage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const message = value as Partial<ExtensionHandoffMessage>;
  const payload = validateLinkedInJobHandoffPayload(message.payload);

  if (message.type !== handoffMessageType || !payload) {
    return null;
  }

  return {
    type: handoffMessageType,
    handoffId: text(message.handoffId) || undefined,
    payload,
  };
}

export function getExtensionHandoffKey(message: ExtensionHandoffMessage) {
  return (
    message.handoffId ||
    [
      message.payload.url,
      message.payload.title,
      message.payload.company,
      message.payload.description.slice(0, 120),
    ]
      .filter(Boolean)
      .join('|')
  );
}

export function shouldAutoAnalyzeExtensionHandoff({
  hasSavedResume,
  currentJobDescriptionText,
  didPopulateJobDescription,
  alreadyConsumed,
}: AutoAnalyzeDecisionInput) {
  return (
    hasSavedResume &&
    currentJobDescriptionText.trim().length === 0 &&
    didPopulateJobDescription &&
    !alreadyConsumed
  );
}

export function formatLinkedInJobDescription(payload: LinkedInJobHandoffPayload) {
  const metadataLines = [
    'LinkedIn Job Posting',
    '',
    optionalLine('Title', payload.title),
    optionalLine('Company', payload.company),
    optionalLine('Location', payload.location),
    optionalLine('Employment Type', payload.employmentType),
    optionalLine('Workplace Type', payload.workplaceType),
    'Source: LinkedIn',
    optionalLine('URL', payload.url),
  ].filter((line): line is string => line !== null);

  return [...metadataLines, '', 'Job Description:', payload.description].join('\n');
}

export function getExtensionHandoffIdFromUrl(url: string) {
  try {
    return new URL(url).searchParams.get('handoffId')?.trim() || null;
  } catch {
    return null;
  }
}

export function removeExtensionHandoffIdFromUrl(url: string) {
  const parsedUrl = new URL(url);
  parsedUrl.searchParams.delete('handoffId');
  return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
}
