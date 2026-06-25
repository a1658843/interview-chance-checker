export const employmentTypes = [
  'Full-Time',
  'Part-Time',
  'Contract',
  'Part-Time Contract',
  'Full-Time Contract',
  'Contract-to-Hire',
  'Internship',
];

function countMatches(text, patterns) {
  return patterns.reduce((count, pattern) => count + (text.match(pattern)?.length ?? 0), 0);
}

function getEmploymentTypeFromLabel(value) {
  const normalized = String(value ?? '').toLowerCase().replace(/[_\s]+/g, ' ').trim();

  if (/^full[- ]?time$/.test(normalized) || normalized === 'fte') return 'Full-Time';
  if (/^part[- ]?time$/.test(normalized)) return 'Part-Time';
  if (/^contract$/.test(normalized) || /^temporary$/.test(normalized)) return 'Contract';
  if (/^internship$/.test(normalized) || /^intern$/.test(normalized)) return 'Internship';
  return null;
}

function extractLinkedInMetadataType(text) {
  const metadataTypes = [];

  for (const line of text.split(/\r?\n/).slice(0, 12)) {
    const normalizedLine = line
      .replace(/^[\s*•\-]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    const type = getEmploymentTypeFromLabel(normalizedLine);

    if (type) {
      metadataTypes.push(type);
    }
  }

  const uniqueTypes = Array.from(new Set(metadataTypes));
  return uniqueTypes.length === 1 ? uniqueTypes[0] : null;
}

function extractExplicitEmploymentType(text) {
  const explicitPatterns = [
    {
      type: 'Contract-to-Hire',
      patterns: [
        /\bcontract\s*[-/]?\s*to\s*[-/]?\s*hire\b/i,
        /\bcontract-to-hire\b/i,
        /\btemp\s*[-/]?\s*to\s*[-/]?\s*perm(?:anent)?\b/i,
      ],
    },
    {
      type: 'Full-Time',
      patterns: [
        /\b(?:employment|job|position|role|work)\s+type\s*:\s*full\s*[- ]?\s*time\b/i,
        /\bthis\s+is\s+a\s+full\s*[- ]?\s*time\s+(?:position|role|job|opportunity)\b/i,
        /\bfull\s*[- ]?\s*time\s+(?:position|role|job|opportunity|employment)\b/i,
      ],
    },
    {
      type: 'Part-Time',
      patterns: [
        /\b(?:employment|job|position|role|work)\s+type\s*:\s*part\s*[- ]?\s*time\b/i,
        /\bthis\s+is\s+a\s+part\s*[- ]?\s*time\s+(?:position|role|job|opportunity)\b/i,
        /\bpart\s*[- ]?\s*time\s+(?:position|role|job|opportunity|employment)\b/i,
      ],
    },
    {
      type: 'Contract',
      patterns: [
        /\b(?:employment|job|position|role|work)\s+type\s*:\s*contract\b/i,
        /\btype\s*:\s*contract\b/i,
        /\bthis\s+is\s+a\s+contract\s+(?:position|role|job|opportunity|engagement)\b/i,
        /\bcontract\s+(?:position|role|job|opportunity|engagement|assignment)\b/i,
      ],
    },
    {
      type: 'Internship',
      patterns: [
        /\b(?:employment|job|position|role|work)\s+type\s*:\s*intern(?:ship)?\b/i,
        /\bthis\s+is\s+an?\s+internship\b/i,
        /\binternship\s+(?:position|role|job|opportunity)\b/i,
      ],
    },
  ];

  const matches = explicitPatterns.filter(({ patterns }) => patterns.some((pattern) => pattern.test(text)));

  if (matches.length === 0) return null;
  if (matches.some((match) => match.type === 'Contract-to-Hire')) return 'Contract-to-Hire';

  const types = Array.from(new Set(matches.map((match) => match.type)));
  const fullTimeCount = countMatches(text, [/\bfull\s*[- ]?\s*time\b/gi, /\bfte\b/gi]);
  const partTimeCount = countMatches(text, [/\bpart\s*[- ]?\s*time\b/gi]);

  if (types.includes('Contract') && partTimeCount > 0 && fullTimeCount === 0) return 'Part-Time Contract';
  if (types.includes('Contract') && fullTimeCount > 0 && partTimeCount === 0) return 'Full-Time Contract';
  if (types.includes('Contract') && types.includes('Part-Time') && !types.includes('Full-Time')) return 'Part-Time Contract';
  if (types.includes('Contract') && types.includes('Full-Time') && !types.includes('Part-Time')) return 'Full-Time Contract';

  return types.length === 1 ? types[0] : null;
}

function getFallbackContractCount(text) {
  const textWithoutBusinessContractReferences = text.replace(
    /\b(?:customer|client|government|federal|project|vendor|supplier|commercial)\s+contracts?\b|\bcontracts?\s+(?:programs?|vehicles?|lifecycle|management|renewals?|performance|period|administration|support|compliance)\b|\bperiod of performance for this contract\b/gi,
    ' ',
  );

  return countMatches(textWithoutBusinessContractReferences, [
    /\b(?:w2|1099|c2c)\s+contract\b/gi,
    /\b\d{1,2}[- ]month\s+contract\b/gi,
    /\bcontract\s+(?:role|position|job|opportunity|engagement|assignment)\b/gi,
    /\bcontractor\b/gi,
  ]);
}

export function extractEmploymentType(jobDescriptionText) {
  const text = String(jobDescriptionText ?? '');
  const metadataType = extractLinkedInMetadataType(text);
  if (metadataType) return metadataType;

  const explicitType = extractExplicitEmploymentType(text);
  if (explicitType) return explicitType;

  const fullTimeCount = countMatches(text, [/\bfull\s*[- ]?\s*time\b/gi, /\bfte\b/gi]);
  const partTimeCount = countMatches(text, [/\bpart\s*[- ]?\s*time\b/gi]);
  const contractCount = getFallbackContractCount(text);

  const counts = [
    {
      type: 'Full-Time',
      count: fullTimeCount,
    },
    {
      type: 'Part-Time',
      count: partTimeCount,
    },
    {
      type: 'Contract',
      count: contractCount,
    },
    {
      type: 'Internship',
      count: countMatches(text, [/\binternship\b/gi, /\bintern\b/gi]),
    },
  ].filter((item) => item.count > 0);

  if (counts.length === 0) {
    return null;
  }

  const sorted = counts.sort((a, b) => b.count - a.count);
  if (sorted.length > 1 && sorted[0].count === sorted[1].count) {
    return null;
  }

  return sorted[0].type;
}
