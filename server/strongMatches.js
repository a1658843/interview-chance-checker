const directEquivalentAliases = new Map([
  ['dotnet', ['.net', 'dotnet', 'asp.net', 'asp.net core', 'c#']],
  ['aspnet', ['asp.net', 'asp.net core']],
  ['aspnet core', ['asp.net core']],
  ['entity framework', ['entity framework', 'entity framework core', 'ef core']],
  ['ai coding tools', ['cursor', 'github copilot', 'copilot']],
  ['rest apis', ['rest api', 'rest apis', 'restful api', 'restful apis', 'fastapi', 'asp.net core']],
  ['rest api', ['rest api', 'rest apis', 'restful api', 'restful apis', 'fastapi', 'asp.net core']],
  ['apis', ['api', 'apis', 'rest api', 'rest apis', 'fastapi', 'asp.net core']],
  ['api', ['api', 'apis', 'rest api', 'rest apis', 'fastapi', 'asp.net core']],
  ['sql', ['sql', 'postgresql', 'postgres', 'sql server', 'mysql', 'sqlite']],
  ['postgresql', ['postgresql', 'postgres']],
  ['postgres', ['postgresql', 'postgres']],
  ['database', ['database', 'databases', 'postgresql', 'postgres', 'sql server', 'mysql', 'sqlite']],
  ['databases', ['database', 'databases', 'postgresql', 'postgres', 'sql server', 'mysql', 'sqlite']],
  ['ci cd', ['ci/cd', 'ci cd', 'github actions', 'continuous integration']],
  ['git', ['git', 'github']],
  ['docker', ['docker', 'containerization', 'containerized']],
  ['sql databases', ['sql', 'postgresql', 'postgres', 'sql server', 'mysql', 'sqlite', 'database', 'databases']],
  ['authentication & authorization', [
    'jwt',
    'authentication',
    'authorization',
    'rbac',
    'role based access control',
    'oauth',
    'openid connect',
    'oidc',
    'identity management',
    'user access management',
    'session management',
    'sso',
    'secure login',
    'secure login systems',
    'password hashing',
    'secure password hashing',
  ]],
  ['authentication', [
    'jwt',
    'authentication',
    'authorization',
    'rbac',
    'role based access control',
    'oauth',
    'openid connect',
    'oidc',
    'identity management',
    'user access management',
    'session management',
    'sso',
    'secure login',
    'secure login systems',
    'password hashing',
    'secure password hashing',
  ]],
]);

const authenticationJobSignals = [
  'authentication',
  'authorization',
  'identity management',
  'user access management',
  'microsoft entra',
  'azure ad',
  'azure b2c',
  'b2c',
  'okta',
  'auth0',
  'cognito',
  'keycloak',
  'oauth',
  'openid connect',
  'oidc',
  'sso',
];

const deterministicStrongMatchCatalog = [
  'Python',
  'Java',
  'C#',
  '.NET',
  'Spring Boot',
  'React',
  'TypeScript',
  'JavaScript',
  'ASP.NET Core',
  'Entity Framework',
  'REST APIs',
  'FastAPI',
  'PostgreSQL',
  'SQL Server',
  'SQL Databases',
  'Authentication & Authorization',
  'Docker',
  'GitHub Actions',
  'Git',
  'AI coding tools',
];

const canonicalConcepts = [
  {
    label: 'Python',
    priority: 10,
    labels: ['Python'],
  },
  {
    label: 'Java',
    priority: 10,
    labels: ['Java'],
  },
  {
    label: 'C#',
    priority: 10,
    labels: ['C#'],
  },
  {
    label: 'React',
    priority: 20,
    labels: ['React', 'React.js', 'ReactJS', 'React Hooks'],
  },
  {
    label: 'TypeScript',
    priority: 20,
    labels: ['TypeScript', 'JavaScript'],
  },
  {
    label: '.NET',
    priority: 20,
    labels: ['.NET', 'ASP.NET Core', 'ASP.NET', 'C#'],
  },
  {
    label: 'Spring Boot',
    priority: 20,
    labels: ['Spring Boot'],
  },
  {
    label: 'REST APIs',
    priority: 30,
    labels: ['REST APIs', 'REST API', 'REST', 'RESTful APIs', 'REST API Development', 'API Integration', 'APIs', 'API', 'FastAPI'],
  },
  {
    label: 'Authentication & Authorization',
    priority: 35,
    labels: ['Authentication & Authorization', 'Authentication', 'Authorization', 'JWT', 'RBAC', 'OAuth', 'OIDC'],
  },
  {
    label: 'AWS',
    priority: 40,
    labels: ['AWS'],
  },
  {
    label: 'Azure',
    priority: 40,
    labels: ['Azure'],
  },
  {
    label: 'GCP',
    priority: 40,
    labels: ['GCP', 'Google Cloud'],
  },
  {
    label: 'PostgreSQL',
    priority: 50,
    labels: ['PostgreSQL', 'Postgres'],
    specific: true,
  },
  {
    label: 'SQL Server',
    priority: 50,
    labels: ['SQL Server'],
    specific: true,
  },
  {
    label: 'SQL Databases',
    priority: 50,
    labels: ['SQL Databases', 'SQL', 'Database', 'Databases', 'PostgreSQL', 'Postgres', 'SQL Server', 'MySQL', 'SQLite'],
  },
  {
    label: 'Docker',
    priority: 60,
    labels: ['Docker', 'Containerization', 'Containerized application'],
  },
  {
    label: 'GitHub Actions',
    priority: 60,
    labels: ['GitHub Actions', 'CI/CD', 'Continuous Integration'],
    specific: true,
  },
  {
    label: 'Git',
    priority: 60,
    labels: ['Git', 'GitHub'],
  },
  {
    label: 'AI coding tools',
    priority: 80,
    labels: ['AI coding tools', 'Cursor', 'GitHub Copilot', 'Copilot'],
  },
];

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\bc\+\+\b/g, 'cplusplus')
    .replace(/\bc#\b/g, 'csharp')
    .replace(/\.net/g, ' dotnet ')
    .replace(/asp\.net/g, ' aspnet ')
    .replace(/node\.js/g, ' nodejs ')
    .replace(/vue\.js/g, ' vuejs ')
    .replace(/react\.js/g, ' reactjs ')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAlias(value) {
  return normalizeText(value)
    .replace(/\bcsharp\b/g, 'csharp')
    .replace(/\bcplusplus\b/g, 'cplusplus');
}

function hasNormalizedPhrase(haystack, phrase) {
  const normalizedPhrase = normalizeAlias(phrase);
  if (!normalizedPhrase) {
    return false;
  }

  return new RegExp(`(^| )${normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(haystack);
}

function aliasesForMatch(label) {
  const normalizedLabel = normalizeAlias(label);
  const aliases = directEquivalentAliases.get(normalizedLabel) ?? [label];

  if (normalizedLabel === 'nodejs' || normalizedLabel === 'node') {
    return ['node.js', 'nodejs'];
  }

  if (normalizedLabel === 'vuejs' || normalizedLabel === 'vue') {
    return ['vue.js', 'vuejs'];
  }

  if (normalizedLabel === 'reactjs') {
    return ['react', 'react.js', 'reactjs'];
  }

  return aliases;
}

function getConceptForLabel(label) {
  const normalizedLabel = normalizeAlias(label);

  return canonicalConcepts.find((concept) =>
    concept.labels.some((conceptLabel) => normalizeAlias(conceptLabel) === normalizedLabel),
  );
}

function isGenericNonCanonicalStrongMatch(label) {
  return [
    'backend',
    'backend engineering',
    'backend development',
    'full stack',
    'full-stack',
    'fullstack',
    'software engineering',
  ].includes(normalizeAlias(label));
}

export function isStrongMatchSupportedByResume(label, resumeText) {
  if (typeof label !== 'string' || label.trim().length === 0) {
    return false;
  }

  const normalizedResume = normalizeText(resumeText);
  if (!normalizedResume) {
    return false;
  }

  return aliasesForMatch(label).some((alias) => hasNormalizedPhrase(normalizedResume, alias));
}

export function filterStrongMatchesByResume(strongMatches, resumeText) {
  if (!Array.isArray(strongMatches)) {
    return [];
  }

  const seen = new Set();
  const filtered = [];

  for (const match of strongMatches) {
    const label = typeof match === 'string' ? match.trim() : '';
    const key = label.toLowerCase();

    if (!label || seen.has(key) || !isStrongMatchSupportedByResume(label, resumeText)) {
      continue;
    }

    seen.add(key);
    filtered.push(label);

    if (filtered.length === 5) {
      break;
    }
  }

  return filtered;
}

function jobRequestsAuthentication(jobDescriptionText) {
  const normalizedJobDescription = normalizeText(jobDescriptionText);

  return authenticationJobSignals.some((signal) =>
    hasNormalizedPhrase(normalizedJobDescription, signal),
  );
}

function jobRequestsStrongMatch(label, jobDescriptionText) {
  if (label === 'Authentication' || label === 'Authentication & Authorization') {
    return jobRequestsAuthentication(jobDescriptionText);
  }

  const normalizedJobDescription = normalizeText(jobDescriptionText);
  return aliasesForMatch(label).some((alias) => hasNormalizedPhrase(normalizedJobDescription, alias));
}

function jobRequestsConcept(concept, jobDescriptionText) {
  if (concept.label === 'Authentication & Authorization') {
    return jobRequestsAuthentication(jobDescriptionText);
  }

  return concept.labels.some((label) => jobRequestsStrongMatch(label, jobDescriptionText));
}

function resumeSupportsConcept(concept, resumeText) {
  return concept.labels.some((label) => isStrongMatchSupportedByResume(label, resumeText));
}

function conceptDisplayLabel(concept, jobDescriptionText) {
  if (concept.label === 'SQL Databases') {
    const normalizedJobDescription = normalizeText(jobDescriptionText);
    const jobRequestsPostgres =
      hasNormalizedPhrase(normalizedJobDescription, 'postgresql') ||
      hasNormalizedPhrase(normalizedJobDescription, 'postgres');
    const jobRequestsSqlServer = hasNormalizedPhrase(normalizedJobDescription, 'sql server');
    const jobRequestsGeneralSql =
      hasNormalizedPhrase(normalizedJobDescription, 'sql') ||
      hasNormalizedPhrase(normalizedJobDescription, 'database') ||
      hasNormalizedPhrase(normalizedJobDescription, 'databases');

    if (jobRequestsPostgres && !jobRequestsGeneralSql) return 'PostgreSQL';
    if (jobRequestsSqlServer && !jobRequestsGeneralSql) return 'SQL Server';
  }

  return concept.label;
}

function canonicalizeStrongMatchLabels(labels, { resumeText, jobDescriptionText }) {
  const requestedConcepts = [];
  const seenConcepts = new Set();

  for (const concept of canonicalConcepts) {
    if (!jobRequestsConcept(concept, jobDescriptionText) || !resumeSupportsConcept(concept, resumeText)) {
      continue;
    }

    const conceptKey = concept.label.toLowerCase();
    if (seenConcepts.has(conceptKey)) {
      continue;
    }

    seenConcepts.add(conceptKey);
    requestedConcepts.push({
      label: conceptDisplayLabel(concept, jobDescriptionText),
      priority: concept.priority,
    });
  }

  for (const label of labels) {
    const concept = getConceptForLabel(label);

    if (!concept && isGenericNonCanonicalStrongMatch(label)) {
      continue;
    }

    const canonicalLabel = concept ? conceptDisplayLabel(concept, jobDescriptionText) : label;
    const conceptKey = (concept?.label ?? canonicalLabel).toLowerCase();

    if (concept && (!jobRequestsConcept(concept, jobDescriptionText) || !resumeSupportsConcept(concept, resumeText))) {
      continue;
    }

    if (seenConcepts.has(conceptKey)) {
      continue;
    }

    seenConcepts.add(conceptKey);
    requestedConcepts.push({
      label: canonicalLabel,
      priority: concept?.priority ?? 90,
    });
  }

  const seenLabels = new Set();
  const rankedLabels = requestedConcepts
    .sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label))
    .map(({ label }) => label)
    .filter((label) => {
      const key = normalizeAlias(label);
      if (seenLabels.has(key)) return false;
      seenLabels.add(key);
      return true;
    });

  const hasReact = rankedLabels.includes('React');
  const hasSpecificSqlDatabase = rankedLabels.some((label) =>
    ['PostgreSQL', 'SQL Server', 'MySQL'].includes(label),
  );

  return rankedLabels
    .filter((label) => !(hasReact && ['TypeScript', 'JavaScript'].includes(label)))
    .filter((label) => !(hasSpecificSqlDatabase && label === 'SQL Databases'))
    .slice(0, 5);
}

export function normalizeStrongMatches(strongMatches, { resumeText, jobDescriptionText }) {
  const filtered = filterStrongMatchesByResume(strongMatches, resumeText);

  const deterministicMatches = deterministicStrongMatchCatalog.filter(
    (label) =>
      jobRequestsStrongMatch(label, jobDescriptionText) &&
      isStrongMatchSupportedByResume(label, resumeText),
  );
  return canonicalizeStrongMatchLabels([...deterministicMatches, ...filtered], {
    resumeText,
    jobDescriptionText,
  });
}
