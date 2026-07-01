(function registerContentScriptFacade() {
  globalThis.InterviewChanceCheckerContentScript = {
    extractCurrentLinkedInJob() {
      const extractor = globalThis.InterviewChanceCheckerLinkedInExtractor;

      if (!extractor || typeof extractor.extractLinkedInJob !== 'function') {
        return {
          ok: false,
          error: 'LinkedIn extractor was not loaded.',
        };
      }

      return extractor.extractLinkedInJob();
    },
  };
})();
