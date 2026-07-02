(function runAppBridge() {
  function consumeHandoff(handoffId) {
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
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'INTERVIEW_CHANCE_CHECKER_CONSUME_HANDOFF') {
      return false;
    }

    consumeHandoff(message.handoffId);
    sendResponse({ ok: true });
    return false;
  });

  consumeHandoff(new URL(window.location.href).searchParams.get('handoffId'));
})();
