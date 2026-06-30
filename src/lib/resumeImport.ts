export const resumeImportMaxFileSizeBytes = 5 * 1024 * 1024;
const scannedPdfErrorMessage =
  'This PDF does not contain selectable text. Please upload a text-based PDF, DOCX, or TXT resume.';
const emptyFileErrorMessage = 'This resume file appears to be empty.';

export class ResumeImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResumeImportError';
  }
}

type FileExtension = 'txt' | 'docx' | 'pdf';
type MammothModule = typeof import('mammoth');
type PdfJsModule = typeof import('pdfjs-dist');

type ResumeImportDependencies = {
  mammoth?: Pick<MammothModule, 'extractRawText'>;
  pdfjs?: Pick<PdfJsModule, 'GlobalWorkerOptions' | 'getDocument'>;
};

function getFileExtension(fileName: string): FileExtension | null {
  const normalizedName = fileName.toLowerCase();

  if (normalizedName.endsWith('.txt')) return 'txt';
  if (normalizedName.endsWith('.docx')) return 'docx';
  if (normalizedName.endsWith('.pdf')) return 'pdf';

  return null;
}

function validateResumeFile(file: File) {
  const extension = getFileExtension(file.name);

  if (!extension) {
    throw new ResumeImportError('Please choose a PDF, DOCX, or TXT resume file.');
  }

  if (file.size > resumeImportMaxFileSizeBytes) {
    throw new ResumeImportError('Resume file is too large. Please choose a file under 5 MB.');
  }

  return extension;
}

function normalizeImportedText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readTxtResumeFile(file: File) {
  let text: string;

  try {
    text = await file.text();
  } catch {
    throw new ResumeImportError('Could not read this resume file. Please try another PDF, DOCX, or TXT file.');
  }

  return normalizeImportedText(text);
}

async function extractDocxResumeText(file: File, dependencies: ResumeImportDependencies) {
  const mammoth = dependencies.mammoth ?? (await import('mammoth'));
  const arrayBuffer = await file.arrayBuffer();

  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return normalizeImportedText(result.value);
  } catch {
    throw new ResumeImportError('Could not read this DOCX file. Please try a different Word document or export it as PDF/TXT.');
  }
}

async function extractPdfResumeText(file: File, dependencies: ResumeImportDependencies) {
  const pdfjs = dependencies.pdfjs ?? (await import('pdfjs-dist'));

  if (!dependencies.pdfjs) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
  }

  try {
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
        .join(' ')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

      if (pageText) {
        pageTexts.push(pageText);
      }
    }

    const text = normalizeImportedText(pageTexts.join('\n\n'));

    if (text.length < 20) {
      throw new ResumeImportError(scannedPdfErrorMessage);
    }

    return text;
  } catch (error) {
    if (error instanceof ResumeImportError) {
      throw error;
    }

    throw new ResumeImportError('Could not read this PDF file. Please try a text-based PDF, DOCX, or TXT resume.');
  }
}

export async function readResumeFile(file: File, dependencies: ResumeImportDependencies = {}) {
  const extension = validateResumeFile(file);
  const text =
    extension === 'txt'
      ? await readTxtResumeFile(file)
      : extension === 'docx'
        ? await extractDocxResumeText(file, dependencies)
        : await extractPdfResumeText(file, dependencies);

  if (text.trim().length === 0) {
    throw new ResumeImportError(extension === 'pdf' ? scannedPdfErrorMessage : emptyFileErrorMessage);
  }

  return text;
}

export { readResumeFile as readTxtResumeFile };
