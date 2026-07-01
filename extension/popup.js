const appOrigin = globalThis.InterviewChanceCheckerConfig?.appOrigin || 'http://localhost:5173';
const handoffPrefix = 'icc-linkedin-job-handoff:';

let extractedPayload = null;

const statusElement = document.getElementById('status');
const titleElement = document.getElementById('title');
const metaElement = document.getElementById('meta');
const warningElement = document.getElementById('warning');
const analyzeButton = document.getElementById('analyzeButton');

function setStatus(message, variant = 'normal') {
  statusElement.textContent = message;
  statusElement.className = variant === 'error' ? 'status error' : 'status';
}

function showPreview(result) {
  extractedPayload = result.payload;
  titleElement.hidden = false;
  titleElement.textContent = result.payload.title || 'LinkedIn job posting';

  const metaParts = [result.payload.company, result.payload.location].filter(Boolean);
  metaElement.hidden = metaParts.length === 0;
  metaElement.textContent = metaParts.join(' · ');

  warningElement.hidden = !result.warning;
  warningElement.textContent = result.warning || '';

  setStatus('Job description extracted.');
  analyzeButton.disabled = false;
}

function showFailure(message) {
  extractedPayload = null;
  titleElement.hidden = true;
  metaElement.hidden = true;
  warningElement.hidden = true;
  analyzeButton.disabled = true;
  setStatus(message, 'error');
}

function createHandoffId() {
  const random = crypto.getRandomValues(new Uint32Array(2)).join('');
  return `${handoffPrefix}${Date.now()}:${random}`;
}

function createAppUrl(handoffId) {
  return `${appOrigin}/?handoffId=${encodeURIComponent(handoffId)}`;
}

function createAppTabPattern() {
  return `${appOrigin.replace(/\/$/, '')}/*`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function extractCurrentJob(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['linkedinExtractor.js', 'contentScript.js'],
  });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => globalThis.InterviewChanceCheckerContentScript.extractCurrentLinkedInJob(),
  });

  return result?.result;
}

async function openOrReuseAppTab(appUrl) {
  const [existingTab] = await chrome.tabs.query({ url: createAppTabPattern() });

  if (existingTab?.id) {
    await chrome.tabs.update(existingTab.id, { active: true, url: appUrl });

    if (existingTab.windowId) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }

    return;
  }

  await chrome.tabs.create({ url: appUrl });
}

async function initializePopup() {
  try {
    const tab = await getActiveTab();

    if (!tab?.id || !/^https:\/\/www\.linkedin\.com\/jobs\//i.test(tab.url || '')) {
      showFailure('Open a LinkedIn job posting, then click the extension again.');
      return;
    }

    setStatus('Extracting visible LinkedIn job details...');
    const result = await extractCurrentJob(tab.id);

    if (!result?.ok) {
      showFailure(result?.error || 'Could not extract this LinkedIn job posting.');
      return;
    }

    showPreview(result);
  } catch (error) {
    showFailure('Could not read this page. Refresh LinkedIn and try again.');
  }
}

analyzeButton.addEventListener('click', async () => {
  if (!extractedPayload) {
    return;
  }

  analyzeButton.disabled = true;
  analyzeButton.textContent = 'Opening app...';

  const handoffId = createHandoffId();
  await chrome.storage.local.set({ [handoffId]: extractedPayload });
  await openOrReuseAppTab(createAppUrl(handoffId));
});

initializePopup();
