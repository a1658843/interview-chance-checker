(function runAppBridge() {
  const handoffId = new URL(window.location.href).searchParams.get('handoffId');

  if (!handoffId) {
    return;
  }

  chrome.storage.local.get(handoffId, (items) => {
    const payload = items?.[handoffId];

    if (!payload) {
      return;
    }

    window.postMessage(
      {
        type: 'INTERVIEW_CHANCE_CHECKER_LINKEDIN_HANDOFF',
        handoffId,
        payload,
      },
      window.location.origin,
    );

    chrome.storage.local.remove(handoffId);
  });
})();
