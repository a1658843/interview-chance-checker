(function registerLinkedInExtractor() {
  const minimumDescriptionLength = 80;

  function normalizeWhitespace(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function visibleText(element) {
    if (!element) return '';
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return '';
    return normalizeWhitespace(element.innerText || element.textContent || '');
  }

  function firstText(selectors, root = document) {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      const text = visibleText(element);
      if (text) return text;
    }

    return '';
  }

  function findJobRoot() {
    return (
      document.querySelector('.jobs-search__job-details--container') ||
      document.querySelector('.jobs-details') ||
      document.querySelector('.job-view-layout') ||
      document.querySelector('main') ||
      document.body
    );
  }

  function extractMetadata(root) {
    const topCardText = firstText(
      [
        '.job-details-jobs-unified-top-card__primary-description-container',
        '.jobs-unified-top-card__primary-description',
        '.jobs-unified-top-card__subtitle-primary-grouping',
        '.jobs-unified-top-card__job-insight',
      ],
      root,
    );
    const lines = topCardText
      .split('\n')
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean);
    const location =
      firstText(
        [
          '.job-details-jobs-unified-top-card__primary-description-container span',
          '.jobs-unified-top-card__bullet',
          '.jobs-unified-top-card__subtitle-primary-grouping span',
        ],
        root,
      ) || lines.find((line) => /remote|hybrid|united states|,[ ]?[a-z]{2}\b/i.test(line));
    const insightText = visibleText(root.querySelector('.jobs-unified-top-card__job-insight')) || visibleText(root);
    const employmentTypeMatch = insightText.match(/\b(full-time|part-time|contract|temporary|internship)\b/i);
    const workplaceTypeMatch = insightText.match(/\b(remote|hybrid|on-site|onsite)\b/i);

    return {
      location: normalizeWhitespace(location),
      employmentType: employmentTypeMatch ? employmentTypeMatch[1] : '',
      workplaceType: workplaceTypeMatch ? workplaceTypeMatch[1] : '',
    };
  }

  function extractDescription(root) {
    const description = firstText(
      [
        '#job-details',
        '.jobs-description__content',
        '.jobs-box__html-content',
        '.jobs-description-content__text',
        '.jobs-description',
      ],
      root,
    );

    return normalizeWhitespace(description);
  }

  function isPossiblyTruncated(root) {
    return Array.from(root.querySelectorAll('button')).some((button) => {
      const text = visibleText(button);
      return /show more|see more/i.test(text) || button.getAttribute('aria-expanded') === 'false';
    });
  }

  function extractLinkedInJob() {
    if (!/https:\/\/www\.linkedin\.com\/jobs\//i.test(window.location.href)) {
      return {
        ok: false,
        error: 'Open a LinkedIn job posting before using the extension.',
      };
    }

    const root = findJobRoot();
    const title = firstText(
      [
        '.job-details-jobs-unified-top-card__job-title h1',
        '.job-details-jobs-unified-top-card__job-title',
        '.jobs-unified-top-card__job-title h1',
        '.jobs-unified-top-card__job-title',
        'h1',
      ],
      root,
    );
    const company = firstText(
      [
        '.job-details-jobs-unified-top-card__company-name a',
        '.job-details-jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__company-name a',
        '.jobs-unified-top-card__company-name',
        '[data-test-job-company-name]',
      ],
      root,
    );
    const description = extractDescription(root);
    const metadata = extractMetadata(root);
    const truncated = isPossiblyTruncated(root);

    if (description.length < minimumDescriptionLength) {
      return {
        ok: false,
        title,
        company,
        location: metadata.location,
        isTruncated: truncated,
        error: truncated
          ? 'The job description looks collapsed. Expand the LinkedIn description, then try again.'
          : 'Could not find a meaningful job description on this page.',
      };
    }

    return {
      ok: true,
      payload: {
        source: 'linkedin',
        extractedAt: new Date().toISOString(),
        url: window.location.href,
        title,
        company,
        location: metadata.location,
        employmentType: metadata.employmentType,
        workplaceType: metadata.workplaceType,
        description,
      },
      isTruncated: truncated,
      warning: truncated ? 'The description may be collapsed. Expand it on LinkedIn for best results.' : '',
    };
  }

  globalThis.InterviewChanceCheckerLinkedInExtractor = {
    extractLinkedInJob,
  };
})();
