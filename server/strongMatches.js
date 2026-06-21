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

export function normalizeStrongMatches(strongMatches, { resumeText, jobDescriptionText }) {
  const filtered = filterStrongMatchesByResume(strongMatches, resumeText);
  const hasAuthenticationMatch = filtered.some(
    (match) => normalizeAlias(match) === 'authentication',
  );

  if (
    !hasAuthenticationMatch &&
    jobRequestsAuthentication(jobDescriptionText) &&
    isStrongMatchSupportedByResume('Authentication', resumeText)
  ) {
    return ['Authentication', ...filtered].slice(0, 5);
  }

  return filtered;
}
