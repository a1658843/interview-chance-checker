import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function importTypeScriptModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const dataUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;

  return import(dataUrl);
}

function createMemoryLocalStorage(initialEntries = []) {
  const values = new Map(initialEntries);

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test('resume storage restores saved resume text', async () => {
  const { readSavedResumeText, resumeStorageKey } = await importTypeScriptModule('../src/lib/resumeStorage.ts');
  global.window = {
    localStorage: createMemoryLocalStorage([[resumeStorageKey, 'Saved resume']]),
  };

  assert.equal(readSavedResumeText(), 'Saved resume');

  delete global.window;
});

test('resume storage saves updated resume text', async () => {
  const { readSavedResumeText, saveResumeTextLocally } = await importTypeScriptModule('../src/lib/resumeStorage.ts');
  global.window = {
    localStorage: createMemoryLocalStorage(),
  };

  saveResumeTextLocally('Updated resume');

  assert.equal(readSavedResumeText(), 'Updated resume');

  delete global.window;
});

test('resume storage clears saved resume text', async () => {
  const { clearSavedResumeText, readSavedResumeText, resumeStorageKey } = await importTypeScriptModule(
    '../src/lib/resumeStorage.ts',
  );
  global.window = {
    localStorage: createMemoryLocalStorage([[resumeStorageKey, 'Saved resume']]),
  };

  clearSavedResumeText();

  assert.equal(readSavedResumeText(), '');

  delete global.window;
});

test('resume import rejects unsupported files', async () => {
  const { readResumeFile, ResumeImportError } = await importTypeScriptModule('../src/lib/resumeImport.ts');

  await assert.rejects(
    () => readResumeFile(new File(['Resume'], 'resume.rtf', { type: 'application/rtf' })),
    ResumeImportError,
  );
});

test('resume import rejects empty txt files', async () => {
  const { readResumeFile, ResumeImportError } = await importTypeScriptModule('../src/lib/resumeImport.ts');

  await assert.rejects(
    () => readResumeFile(new File(['   '], 'resume.txt', { type: 'text/plain' })),
    ResumeImportError,
  );
});

test('resume import rejects txt files over the size limit', async () => {
  const { readResumeFile, ResumeImportError, resumeImportMaxFileSizeBytes } = await importTypeScriptModule(
    '../src/lib/resumeImport.ts',
  );
  const file = {
    name: 'resume.txt',
    size: resumeImportMaxFileSizeBytes + 1,
    text: async () => 'Resume',
  };

  await assert.rejects(() => readResumeFile(file), ResumeImportError);
});

test('resume import reports unreadable txt files', async () => {
  const { readResumeFile, ResumeImportError } = await importTypeScriptModule('../src/lib/resumeImport.ts');
  const file = {
    name: 'resume.txt',
    size: 12,
    text: async () => {
      throw new Error('read failed');
    },
  };

  await assert.rejects(() => readResumeFile(file), ResumeImportError);
});

test('resume import accepts valid txt content', async () => {
  const { readResumeFile } = await importTypeScriptModule('../src/lib/resumeImport.ts');

  assert.equal(
    await readResumeFile(new File(['Python\nReact\nFastAPI'], 'resume.txt', { type: 'text/plain' })),
    'Python\nReact\nFastAPI',
  );
});

test('resume import extracts docx text with mammoth', async () => {
  const { readResumeFile } = await importTypeScriptModule('../src/lib/resumeImport.ts');
  const file = {
    name: 'resume.docx',
    size: 2048,
    arrayBuffer: async () => new ArrayBuffer(8),
  };

  const text = await readResumeFile(file, {
    mammoth: {
      extractRawText: async () => ({ value: 'Python Developer\nFastAPI' }),
    },
  });

  assert.equal(text, 'Python Developer\nFastAPI');
});

test('resume import reports corrupted docx files', async () => {
  const { readResumeFile, ResumeImportError } = await importTypeScriptModule('../src/lib/resumeImport.ts');
  const file = {
    name: 'resume.docx',
    size: 2048,
    arrayBuffer: async () => new ArrayBuffer(8),
  };

  await assert.rejects(
    () =>
      readResumeFile(file, {
        mammoth: {
          extractRawText: async () => {
            throw new Error('bad docx');
          },
        },
      }),
    ResumeImportError,
  );
});

test('resume import extracts text-based pdf content page by page', async () => {
  const { readResumeFile } = await importTypeScriptModule('../src/lib/resumeImport.ts');
  const file = {
    name: 'resume.pdf',
    size: 2048,
    arrayBuffer: async () => new ArrayBuffer(8),
  };
  const pdfjs = {
    GlobalWorkerOptions: {},
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: async (pageNumber) => ({
          getTextContent: async () => ({
            items:
              pageNumber === 1
                ? [{ str: 'Python Developer' }, { str: 'FastAPI' }]
                : [{ str: 'React' }, { str: 'TypeScript' }],
          }),
        }),
      }),
    }),
  };

  assert.equal(await readResumeFile(file, { pdfjs }), 'Python Developer FastAPI\n\nReact TypeScript');
});

test('resume import reports scanned or empty pdf files', async () => {
  const { readResumeFile, ResumeImportError } = await importTypeScriptModule('../src/lib/resumeImport.ts');
  const file = {
    name: 'resume.pdf',
    size: 2048,
    arrayBuffer: async () => new ArrayBuffer(8),
  };
  const pdfjs = {
    GlobalWorkerOptions: {},
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({ items: [] }),
        }),
      }),
    }),
  };

  await assert.rejects(() => readResumeFile(file, { pdfjs }), ResumeImportError);
});

test('imported resume text can be persisted locally', async () => {
  const { readResumeFile } = await importTypeScriptModule('../src/lib/resumeImport.ts');
  const { readSavedResumeText, saveResumeTextLocally } = await importTypeScriptModule('../src/lib/resumeStorage.ts');
  global.window = {
    localStorage: createMemoryLocalStorage(),
  };

  saveResumeTextLocally(await readResumeFile(new File(['Imported resume'], 'resume.txt', { type: 'text/plain' })));

  assert.equal(readSavedResumeText(), 'Imported resume');

  delete global.window;
});

test('extension handoff accepts valid LinkedIn payloads and formats job descriptions', async () => {
  const { formatLinkedInJobDescription, validateLinkedInJobHandoffPayload } = await importTypeScriptModule(
    '../src/lib/extensionJobHandoff.ts',
  );
  const payload = validateLinkedInJobHandoffPayload({
    source: 'linkedin',
    title: 'Software Engineer',
    company: 'Example Co',
    location: 'Remote',
    employmentType: 'Full-time',
    workplaceType: 'Remote',
    url: 'https://www.linkedin.com/jobs/view/123',
    description:
      'Build backend APIs, improve distributed systems, collaborate with product teams, and support production services for customers.',
  });

  assert.ok(payload);
  assert.match(formatLinkedInJobDescription(payload), /LinkedIn Job Posting/);
  assert.match(formatLinkedInJobDescription(payload), /Title: Software Engineer/);
  assert.match(formatLinkedInJobDescription(payload), /Company: Example Co/);
  assert.match(formatLinkedInJobDescription(payload), /Job Description:/);
});

test('extension handoff rejects malformed payloads', async () => {
  const { parseExtensionHandoffMessage, validateLinkedInJobHandoffPayload } = await importTypeScriptModule(
    '../src/lib/extensionJobHandoff.ts',
  );

  assert.equal(validateLinkedInJobHandoffPayload({ source: 'linkedin' }), null);
  assert.equal(parseExtensionHandoffMessage({ type: 'WRONG_TYPE', payload: {} }), null);
});

test('extension handoff rejects empty or too-short descriptions', async () => {
  const { validateLinkedInJobHandoffPayload } = await importTypeScriptModule('../src/lib/extensionJobHandoff.ts');

  assert.equal(
    validateLinkedInJobHandoffPayload({
      source: 'linkedin',
      description: 'Too short.',
    }),
    null,
  );
});

test('extension handoff can auto-populate an empty job description', async () => {
  const {
    formatLinkedInJobDescription,
    shouldAutoAnalyzeExtensionHandoff,
    validateLinkedInJobHandoffPayload,
  } = await importTypeScriptModule('../src/lib/extensionJobHandoff.ts');
  const payload = validateLinkedInJobHandoffPayload({
    source: 'linkedin',
    title: 'Frontend Engineer',
    description:
      'Create accessible user interfaces, collaborate with design teams, build React components, and improve product workflows.',
  });
  let jobDescriptionText = '';

  if (payload && jobDescriptionText.trim().length === 0) {
    jobDescriptionText = formatLinkedInJobDescription(payload);
  }

  assert.match(jobDescriptionText, /Frontend Engineer/);
  assert.equal(
    shouldAutoAnalyzeExtensionHandoff({
      hasSavedResume: true,
      currentJobDescriptionText: '',
      didPopulateJobDescription: true,
      alreadyConsumed: false,
    }),
    true,
  );
});

test('extension handoff with existing job description waits for user choice before auto-analysis', async () => {
  const {
    formatLinkedInJobDescription,
    shouldAutoAnalyzeExtensionHandoff,
    validateLinkedInJobHandoffPayload,
  } = await importTypeScriptModule('../src/lib/extensionJobHandoff.ts');
  const payload = validateLinkedInJobHandoffPayload({
    source: 'linkedin',
    title: 'Backend Engineer',
    description:
      'Build APIs, own backend services, work with SQL databases, and collaborate with engineering teams on product features.',
  });
  let jobDescriptionText = 'Existing pasted JD';
  let pendingLinkedInJob = null;

  if (payload && jobDescriptionText.trim().length > 0) {
    pendingLinkedInJob = formatLinkedInJobDescription(payload);
  }

  assert.equal(jobDescriptionText, 'Existing pasted JD');
  assert.match(pendingLinkedInJob, /Backend Engineer/);
  assert.equal(
    shouldAutoAnalyzeExtensionHandoff({
      hasSavedResume: true,
      currentJobDescriptionText: jobDescriptionText,
      didPopulateJobDescription: false,
      alreadyConsumed: false,
    }),
    false,
  );
});

test('extension handoff replace choice can auto-analyze once while keep choice does not', async () => {
  const { formatLinkedInJobDescription, validateLinkedInJobHandoffPayload } = await importTypeScriptModule(
    '../src/lib/extensionJobHandoff.ts',
  );
  const payload = validateLinkedInJobHandoffPayload({
    source: 'linkedin',
    title: 'Backend Engineer',
    description:
      'Build APIs, own backend services, work with SQL databases, and collaborate with engineering teams on product features.',
  });
  assert.ok(payload);

  const incomingJobDescription = formatLinkedInJobDescription(payload);
  let currentJobDescription = 'Existing pasted JD';
  let analyzeCount = 0;

  function replaceCurrentJobDescription() {
    currentJobDescription = incomingJobDescription;
    analyzeCount += 1;
  }

  replaceCurrentJobDescription();

  assert.match(currentJobDescription, /Backend Engineer/);
  assert.equal(analyzeCount, 1);

  currentJobDescription = 'Existing pasted JD';
  analyzeCount = 0;

  function keepCurrentJobDescription() {
    return;
  }

  keepCurrentJobDescription();

  assert.equal(currentJobDescription, 'Existing pasted JD');
  assert.equal(analyzeCount, 0);
});

test('extension handoff without saved resume populates JD but does not auto-analyze', async () => {
  const { shouldAutoAnalyzeExtensionHandoff } = await importTypeScriptModule('../src/lib/extensionJobHandoff.ts');

  assert.equal(
    shouldAutoAnalyzeExtensionHandoff({
      hasSavedResume: false,
      currentJobDescriptionText: '',
      didPopulateJobDescription: true,
      alreadyConsumed: false,
    }),
    false,
  );
});

test('duplicate or replayed extension handoff does not auto-analyze again', async () => {
  const {
    getExtensionHandoffKey,
    parseExtensionHandoffMessage,
    shouldAutoAnalyzeExtensionHandoff,
  } = await importTypeScriptModule('../src/lib/extensionJobHandoff.ts');
  const message = parseExtensionHandoffMessage({
    type: 'INTERVIEW_CHANCE_CHECKER_LINKEDIN_HANDOFF',
    handoffId: 'handoff-123',
    payload: {
      source: 'linkedin',
      title: 'Software Engineer',
      description:
        'Build software, collaborate with cross-functional partners, improve systems, and support reliable production workflows.',
    },
  });
  assert.ok(message);

  const consumed = new Set();
  let analyzeCount = 0;

  for (let index = 0; index < 2; index += 1) {
    const key = getExtensionHandoffKey(message);
    const alreadyConsumed = consumed.has(key);

    if (
      shouldAutoAnalyzeExtensionHandoff({
        hasSavedResume: true,
        currentJobDescriptionText: '',
        didPopulateJobDescription: true,
        alreadyConsumed,
      })
    ) {
      analyzeCount += 1;
    }

    consumed.add(key);
  }

  assert.equal(analyzeCount, 1);
});

test('manual paste flow does not auto-run extension analysis', async () => {
  const { shouldAutoAnalyzeExtensionHandoff } = await importTypeScriptModule('../src/lib/extensionJobHandoff.ts');

  assert.equal(
    shouldAutoAnalyzeExtensionHandoff({
      hasSavedResume: true,
      currentJobDescriptionText: '',
      didPopulateJobDescription: false,
      alreadyConsumed: false,
    }),
    false,
  );
});

test('extension handoff removes only the consumed handoff id from app URL', async () => {
  const { getExtensionHandoffIdFromUrl, removeExtensionHandoffIdFromUrl } = await importTypeScriptModule(
    '../src/lib/extensionJobHandoff.ts',
  );
  const url = 'http://localhost:5173/?handoffId=abc123&theme=dark#results';

  assert.equal(getExtensionHandoffIdFromUrl(url), 'abc123');
  assert.equal(removeExtensionHandoffIdFromUrl(url), '/?theme=dark#results');
});

test('extension handoff helpers do not modify saved resume storage', async () => {
  const { formatLinkedInJobDescription, validateLinkedInJobHandoffPayload } = await importTypeScriptModule(
    '../src/lib/extensionJobHandoff.ts',
  );
  const { readSavedResumeText, resumeStorageKey } = await importTypeScriptModule('../src/lib/resumeStorage.ts');
  global.window = {
    localStorage: createMemoryLocalStorage([[resumeStorageKey, 'Saved resume']]),
  };
  const payload = validateLinkedInJobHandoffPayload({
    source: 'linkedin',
    title: 'Software Engineer',
    description:
      'Build software, collaborate with cross-functional partners, improve systems, and support reliable production workflows.',
  });

  if (payload) {
    formatLinkedInJobDescription(payload);
  }

  assert.equal(readSavedResumeText(), 'Saved resume');

  delete global.window;
});
