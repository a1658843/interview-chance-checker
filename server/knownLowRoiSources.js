export const knownLowRoiSources = [
  'AgileGrid Solutions',
  'FetchJobs.co',
  'Stealth Startup',
  'Next Match AI',
  'Sundayy',
  'AfterQuery Experts',
  'Quik Hire Staffing',
  'Hire Feed',
  'Crossing Hurdles',
  'micro1',
  'Mercor',
  'Ladders',
  'Jobright.ai',
  'Netrolynx AI',
];

function normalizeSourceName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\.(?:com|co|ai)\b/g, '')
    .replace(/\b(?:inc|llc|ltd|corp|corporation|company)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function isKnownLowRoiSource(postingSource) {
  const normalizedPostingSource = normalizeSourceName(postingSource);

  if (!normalizedPostingSource) {
    return false;
  }

  return knownLowRoiSources.some((source) => {
    const normalizedSource = normalizeSourceName(source);
    const shorterLength = Math.min(normalizedPostingSource.length, normalizedSource.length);
    return (
      normalizedPostingSource === normalizedSource ||
      (shorterLength >= 5 &&
        (normalizedPostingSource.includes(normalizedSource) ||
          normalizedSource.includes(normalizedPostingSource)))
    );
  });
}
