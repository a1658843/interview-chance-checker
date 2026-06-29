import { isKnownLowRoiSource } from './knownLowRoiSources.js';

function getRecommendationType(recommendation) {
  if (String(recommendation ?? '').startsWith('Hard Skip')) return 'Hard Skip';
  if (String(recommendation ?? '').startsWith('Skip')) return 'Skip';
  if (String(recommendation ?? '').startsWith('Strong Apply')) return 'Strong Apply';
  if (String(recommendation ?? '').startsWith('Apply')) return 'Apply';
  return 'Skip';
}

function hasVeryHighApplicationEffort(analysis) {
  const effortLevel = analysis?.effortLevel ?? 'Low';
  const applicationRequirements = Array.isArray(analysis?.applicationRequirements)
    ? analysis.applicationRequirements
    : [];

  return (
    effortLevel === 'Very High' ||
    applicationRequirements.includes('AI Interview Required') ||
    applicationRequirements.includes('Multi-hour Assessment Required') ||
    (applicationRequirements.includes('Coding Challenge Required') &&
      applicationRequirements.includes('Video Submission Required'))
  );
}

function hasProjectMarketplaceSignals(jobDescriptionText) {
  const text = String(jobDescriptionText ?? '');
  const patterns = [
    /\btalent marketplace\b/i,
    /\btalent network\b/i,
    /\btalent pool\b/i,
    /\bresume collection\b/i,
    /\bproject marketplace\b/i,
    /\bproject[- ]task\b/i,
    /\bproject[- ]based tasks?\b/i,
    /\btasks?\s+(?:are\s+)?assigned\s+as\s+available\b/i,
    /\btasks?\s+(?:are\s+)?assigned\s+project[- ]by[- ]project\b/i,
    /\bproject[- ]by[- ]project\b/i,
    /\bfuture opportunities\b/i,
    /\bmatched with clients?\b/i,
    /\bprofile creation\b/i,
    /\bcreate (?:a )?profile\b/i,
    /\bportfolio[- ]building\b/i,
    /\bportfolio building\b/i,
    /\b2\s*(?:-|–|—|to)\s*3\s*weeks?\b/i,
    /\b10\s*(?:-|–|—|to)\s*20\s*hours?\s*\/?\s*week\b/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function hasUnknownClientSignals(jobDescriptionText) {
  return /\b(unknown end client|undisclosed client|confidential client|matched with clients?|multiple clients?|client to be determined)\b/i.test(
    String(jobDescriptionText ?? ''),
  );
}

function hasHighFrictionSignals(analysis, jobDescriptionText) {
  const text = String(jobDescriptionText ?? '');

  return (
    hasVeryHighApplicationEffort(analysis) ||
    /\bai interview before human review\b/i.test(text) ||
    /\bmandatory assessment before recruiter contact\b/i.test(text) ||
    /\bassessment before recruiter\b/i.test(text) ||
    /\bprofile creation before matching\b/i.test(text) ||
    /\bcreate (?:a )?profile before matching\b/i.test(text)
  );
}

export function getRoiSignalLevel(analysis, jobDescriptionText = '') {
  if (isKnownLowRoiSource(analysis?.postingSource)) {
    return 'known-low-roi-source';
  }

  if (analysis?.postingSource) {
    return 'none';
  }

  const companyType = analysis?.companyType ?? 'Unknown';
  const marketplaceSignals = hasProjectMarketplaceSignals(jobDescriptionText);
  const unknownClientSignals = hasUnknownClientSignals(jobDescriptionText);
  const highFrictionSignals = hasHighFrictionSignals(analysis, jobDescriptionText);

  if (
    companyType === 'Talent Network' ||
    companyType === 'Suspicious Posting' ||
    marketplaceSignals ||
    (companyType === 'Staffing Agency' && (unknownClientSignals || highFrictionSignals || marketplaceSignals))
  ) {
    return 'override';
  }

  return 'none';
}

export function hasLowApplicationRoi(analysis, jobDescriptionText = '') {
  return getRoiSignalLevel(analysis, jobDescriptionText) !== 'none';
}

function getRoiReasoning(analysis, roiSignalLevel) {
  if (roiSignalLevel === 'known-low-roi-source') {
    return 'This posting comes from a source associated with consistently low application ROI. While the technical fit may be reasonable, similar postings typically involve intermediary hiring funnels or low-conversion pipelines, making them a poor use of application time.';
  }

  if (roiSignalLevel === 'override') {
    if (analysis?.companyType === 'Staffing Agency') {
      return 'Although the technical fit is acceptable, this appears to involve an intermediary or unclear client path with unusually poor expected return on application time.';
    }

    return 'Although the technical fit is acceptable, this appears to be a talent marketplace or project-task opportunity with unusually poor expected return on application effort.';
  }

  return 'Although the technical fit is acceptable, this opportunity has unusually poor expected return on application time.';
}

export function applyRoiStrategy(technicalAnalysis, { optimizeForApplicationRoi = true, jobDescriptionText = '' } = {}) {
  if (!optimizeForApplicationRoi) {
    return technicalAnalysis;
  }

  const roiSignalLevel = getRoiSignalLevel(technicalAnalysis, jobDescriptionText);
  if (roiSignalLevel === 'known-low-roi-source') {
    const recommendationType = getRecommendationType(technicalAnalysis?.recommendation);

    return {
      ...technicalAnalysis,
      recommendation: recommendationType === 'Hard Skip' ? technicalAnalysis.recommendation : 'Skip \u274c',
      shortReasoning: getRoiReasoning(technicalAnalysis, roiSignalLevel),
    };
  }

  const recommendationType = getRecommendationType(technicalAnalysis?.recommendation);
  if (recommendationType === 'Skip' || recommendationType === 'Hard Skip') {
    return technicalAnalysis;
  }

  if (roiSignalLevel === 'none') {
    return technicalAnalysis;
  }

  return {
    ...technicalAnalysis,
    recommendation: 'Skip \u274c',
    shortReasoning:
      technicalAnalysis.recommendation === 'Skip \u274c'
        ? technicalAnalysis.shortReasoning
        : getRoiReasoning(technicalAnalysis, roiSignalLevel),
  };
}
