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
