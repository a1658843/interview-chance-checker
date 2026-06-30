export const resumeStorageKey = 'interview-chance-checker-resume-text';

export function readSavedResumeText() {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(resumeStorageKey) ?? '';
  } catch {
    return '';
  }
}

export function saveResumeTextLocally(resumeText: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (resumeText.trim().length === 0) {
      window.localStorage.removeItem(resumeStorageKey);
      return;
    }

    window.localStorage.setItem(resumeStorageKey, resumeText);
  } catch {
    // Local persistence is a convenience only; storage failures should not block editing.
  }
}

export function clearSavedResumeText() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(resumeStorageKey);
  } catch {
    // Ignore storage failures so the visible resume field can still be cleared.
  }
}
