import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Info,
  Loader2,
  Moon,
  Pencil,
  RotateCcw,
  Sun,
  Target,
  Trash2,
  Upload,
} from 'lucide-react';
import { TextInputPanel } from './components/TextInputPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { analyzeMatch } from './lib/analyzeMatch';
import { analyzeWithApi } from './lib/apiAnalysis';
import { extractApplicationRequirements, getEffortLevel } from './lib/applicationRequirements';
import { extractEmploymentType } from './lib/employmentType';
import { readResumeFile, ResumeImportError } from './lib/resumeImport';
import { clearSavedResumeText, readSavedResumeText, saveResumeTextLocally } from './lib/resumeStorage';
import { validateAnalysisInputs } from './lib/validation';
import type { AnalysisResult } from './types/analysis';

type Theme = 'light' | 'dark';

const themeStorageKey = 'interview-chance-checker-theme';

function getInitialResumeText() {
  return readSavedResumeText();
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  let savedTheme: string | null = null;

  try {
    savedTheme = window.localStorage.getItem(themeStorageKey);
  } catch {
    savedTheme = null;
  }

  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [resumeText, setResumeText] = useState(getInitialResumeText);
  const [isResumeTextareaVisible, setIsResumeTextareaVisible] = useState(false);
  const [importedResumeFileName, setImportedResumeFileName] = useState<string | null>(null);
  const [hasEditedImportedResume, setHasEditedImportedResume] = useState(false);
  const [jobDescriptionText, setJobDescriptionText] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null);
  const [resumeImportError, setResumeImportError] = useState<string | null>(null);
  const [isImportingResume, setIsImportingResume] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [resultVersion, setResultVersion] = useState(0);
  const [optimizeForApplicationRoi, setOptimizeForApplicationRoi] = useState(true);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const hasSavedResume = resumeText.trim().length > 0;
  const canAnalyze = hasSavedResume && jobDescriptionText.trim().length > 0 && !isAnalyzing;
  const isInputRowCompact = hasSavedResume && !isResumeTextareaVisible;
  const isResumeSetupCompact = !hasSavedResume && !isResumeTextareaVisible;
  const connectedResumeLabel = hasEditedImportedResume
    ? 'Edited resume text'
    : importedResumeFileName ?? 'saved resume';

  useEffect(() => {
    const isDark = theme === 'dark';

    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    saveResumeTextLocally(resumeText);
  }, [resumeText]);

  function setExplicitTheme(nextTheme: Theme) {
    try {
      window.localStorage.setItem(themeStorageKey, nextTheme);
    } catch {
      // Ignore storage failures; the in-session theme should still update.
    }

    setTheme(nextTheme);
  }

  useEffect(() => {
    if (result) {
      console.log('FINAL_RESULT', result);
      console.log('FINAL_RESULT.employmentType', result.employmentType);
      console.log('FINAL_RESULT_JSON', JSON.stringify(result));
    }
  }, [result]);

  function ensureDecisionSignals(analysis: AnalysisResult) {
    const applicationRequirements = Array.from(
      new Set([...analysis.applicationRequirements, ...extractApplicationRequirements(jobDescriptionText)]),
    );
    const technicalRecommendation = analysis.technicalRecommendation ?? analysis.recommendation;
    const technicalReasoning = analysis.technicalReasoning ?? analysis.reasoning;
    const roiRecommendation = analysis.roiRecommendation ?? analysis.recommendation;
    const roiReasoning = analysis.roiReasoning ?? analysis.reasoning;

    return {
      ...analysis,
      technicalRecommendation,
      technicalReasoning,
      roiRecommendation,
      roiReasoning,
      applicationRequirements,
      effortLevel: getEffortLevel(applicationRequirements),
      employmentType: analysis.employmentType ?? extractEmploymentType(jobDescriptionText) ?? undefined,
    };
  }

  function getDisplayedResult(analysis: AnalysisResult | null) {
    if (!analysis) {
      return null;
    }

    return {
      ...analysis,
      recommendation: optimizeForApplicationRoi
        ? (analysis.roiRecommendation ?? analysis.recommendation)
        : (analysis.technicalRecommendation ?? analysis.recommendation),
      reasoning: optimizeForApplicationRoi
        ? (analysis.roiReasoning ?? analysis.reasoning)
        : (analysis.technicalReasoning ?? analysis.reasoning),
    };
  }

  async function handleAnalyze() {
    if (!canAnalyze) {
      return;
    }

    const validationError = validateAnalysisInputs(resumeText, jobDescriptionText);

    if (validationError) {
      setResult(null);
      setInputError(validationError);
      setAnalysisWarning(null);
      return;
    }

    setInputError(null);
    setAnalysisWarning(null);
    setIsAnalyzing(true);

    try {
      setResult(
        ensureDecisionSignals(
          await analyzeWithApi(resumeText, jobDescriptionText, optimizeForApplicationRoi),
        ),
      );
      setResultVersion((version) => version + 1);
    } catch {
      setResult(ensureDecisionSignals(analyzeMatch(resumeText, jobDescriptionText)));
      setResultVersion((version) => version + 1);
      setAnalysisWarning('LLM analysis is unavailable right now, so this result uses the local heuristic fallback.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleReset() {
    setJobDescriptionText('');
    setResult(null);
    setInputError(null);
    setAnalysisWarning(null);
    setResumeImportError(null);
    setIsAnalyzing(false);
    setResultVersion(0);
  }

  async function handleResumeFileSelected(file: File | undefined) {
    if (!file) {
      return;
    }

    setResumeImportError(null);
    setIsImportingResume(true);

    try {
      const importedText = await readResumeFile(file);
      setResumeText(importedText);
      setImportedResumeFileName(file.name);
      setHasEditedImportedResume(false);
      setIsResumeTextareaVisible(false);
      setResult(null);
      setInputError(null);
      setAnalysisWarning(null);
    } catch (error) {
      setResumeImportError(
        error instanceof ResumeImportError
          ? error.message
          : 'Could not import this resume file. Please try another PDF, DOCX, or TXT file.',
      );
    } finally {
      setIsImportingResume(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleClearSavedResume() {
    if (resumeText.trim().length === 0) {
      clearSavedResumeText();
      setResumeImportError(null);
      setIsResumeTextareaVisible(false);
      return;
    }

    const shouldClear = window.confirm('Clear the saved resume text from this browser?');

    if (!shouldClear) {
      return;
    }

    clearSavedResumeText();
    setResumeText('');
    setImportedResumeFileName(null);
    setHasEditedImportedResume(false);
    setIsResumeTextareaVisible(false);
    setResult(null);
    setInputError(null);
    setAnalysisWarning(null);
    setResumeImportError(null);
  }

  return (
    <main className="min-h-screen bg-[#f3f4f6] transition-colors duration-150 ease-out motion-reduce:transition-none dark:bg-zinc-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-slate-300 pb-6 dark:border-zinc-700 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-700 text-white shadow-sm dark:bg-cyan-600 dark:text-white">
                <Target className="h-5 w-5" />
              </span>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-zinc-50 sm:text-4xl">
                Interview Chance Checker
              </h1>
            </div>
            <p className="mt-3 text-base leading-7 text-slate-600 dark:text-zinc-300 sm:text-lg">
              See if a software engineering job is worth applying to.
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-[auto_auto] xl:flex xl:flex-nowrap xl:items-center">
            <button
              type="button"
              onClick={() => setExplicitTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors duration-150 ease-out hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 motion-reduce:transition-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus-visible:ring-cyan-900"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <div className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 sm:col-span-2 xl:col-span-1">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={optimizeForApplicationRoi}
                  onChange={(event) => setOptimizeForApplicationRoi(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-400 text-cyan-700 focus:ring-cyan-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-cyan-500 dark:focus:ring-cyan-600"
                />
                <span className="whitespace-nowrap">Skip Low-ROI Opportunities</span>
              </label>
              <span className="group relative inline-flex">
                <button
                  type="button"
                  aria-label="Skip Low-ROI Opportunities information"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-500 outline-none transition-colors duration-150 ease-out hover:text-cyan-700 focus-visible:text-cyan-700 focus-visible:ring-2 focus-visible:ring-cyan-200 motion-reduce:transition-none dark:text-zinc-400 dark:hover:text-cyan-400 dark:focus-visible:text-cyan-400 dark:focus-visible:ring-cyan-900"
                >
                  <Info className="h-4 w-4" />
                </button>
                <span className="pointer-events-none absolute right-0 top-6 z-10 hidden w-80 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-xs font-normal leading-5 text-slate-600 shadow-lg group-hover:block group-focus-within:block dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  Filters out opportunities with consistently poor expected return on application time, such as talent marketplaces, project-task platforms, or high-friction intermediary funnels. Objective fit analysis is unchanged.
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors duration-150 ease-out hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 motion-reduce:transition-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus-visible:ring-cyan-900"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="inline-flex h-11 min-w-[8.75rem] items-center justify-center gap-2 rounded-md bg-cyan-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors duration-150 ease-out hover:bg-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 motion-reduce:transition-none dark:bg-cyan-600 dark:text-white dark:hover:bg-cyan-500 dark:focus-visible:ring-cyan-900 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  Check Fit
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </header>

        <section className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="sr-only"
            aria-label="Import resume file"
            onChange={(event) => handleResumeFileSelected(event.target.files?.[0])}
          />
          {isResumeSetupCompact ? (
            <article className="rounded-lg border border-slate-300 bg-white px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-950 dark:text-zinc-50">Add your resume</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-zinc-300">
                    Upload a PDF, DOCX, or TXT file, or paste resume text.
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">
                    Saved locally in this browser
                  </p>
                  {resumeImportError ? (
                    <p className="mt-1 text-xs font-medium leading-5 text-rose-700 dark:text-rose-300">
                      {resumeImportError}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImportingResume}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-cyan-700 px-3 text-xs font-semibold text-white shadow-sm transition-colors duration-150 ease-out hover:bg-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 motion-reduce:transition-none dark:bg-cyan-600 dark:hover:bg-cyan-500 dark:focus-visible:ring-cyan-900 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
                  >
                    {isImportingResume ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {isImportingResume ? 'Importing...' : 'Import resume'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResumeImportError(null);
                      setIsResumeTextareaVisible(true);
                    }}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors duration-150 ease-out hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 motion-reduce:transition-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus-visible:ring-cyan-900"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Paste resume text
                  </button>
                </div>
              </div>
            </article>
          ) : null}
          <div className={isInputRowCompact || isResumeSetupCompact ? '' : 'grid gap-4 lg:grid-cols-2'}>
            {!isInputRowCompact && !isResumeSetupCompact ? (
              <TextInputPanel
                id="resume-text"
                label="Resume Text"
                helper="Paste resume text or import a PDF, DOCX, or TXT file."
                placeholder="Paste resume text here..."
                value={resumeText}
                onChange={(value) => {
                  setResumeText(value);
                  if (importedResumeFileName) {
                    setHasEditedImportedResume(true);
                  }
                  setInputError(null);
                  setAnalysisWarning(null);
                  setResumeImportError(null);
                }}
                note="Saved locally in this browser"
                error={resumeImportError}
                disabled={isImportingResume}
                textareaActions={
                  resumeText.trim().length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setIsResumeTextareaVisible(false)}
                      className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-semibold text-slate-500 transition-colors duration-150 ease-out hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 motion-reduce:transition-none dark:text-zinc-400 dark:hover:text-cyan-300 dark:focus-visible:ring-cyan-900"
                    >
                      {importedResumeFileName ? 'Hide extracted text' : 'Use pasted text'}
                    </button>
                  ) : null
                }
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isImportingResume}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors duration-150 ease-out hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 motion-reduce:transition-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus-visible:ring-cyan-900 dark:disabled:bg-zinc-900 dark:disabled:text-zinc-500"
                    >
                      {isImportingResume ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {isImportingResume ? 'Importing...' : 'Import Resume'}
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSavedResume}
                      disabled={isImportingResume || resumeText.trim().length === 0}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md px-2 text-xs font-semibold text-slate-500 transition-colors duration-150 ease-out hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:text-slate-300 motion-reduce:transition-none dark:text-zinc-400 dark:hover:text-rose-300 dark:focus-visible:ring-cyan-900 dark:disabled:text-zinc-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear saved resume
                    </button>
                  </>
                }
              />
            ) : null}
            <TextInputPanel
              id="job-description-text"
              label="Job Description"
              helper="Paste the exact job description for the target role."
              placeholder="Paste job description here..."
              value={jobDescriptionText}
              actions={
                isInputRowCompact ? (
                  <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-slate-600 dark:text-zinc-300">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-cyan-700 dark:text-cyan-300" aria-hidden="true" />
                      <span className="min-w-0 truncate">
                        <span className="text-slate-500 dark:text-zinc-400">Using </span>
                        {connectedResumeLabel}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isImportingResume}
                      className="inline-flex items-center gap-1.5 rounded-sm text-slate-600 transition-colors duration-150 ease-out hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:text-slate-300 motion-reduce:transition-none dark:text-zinc-300 dark:hover:text-cyan-300 dark:focus-visible:ring-cyan-900 dark:disabled:text-zinc-600"
                    >
                      {isImportingResume ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {isImportingResume ? 'Importing...' : 'Replace'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsResumeTextareaVisible(true)}
                      className="inline-flex items-center gap-1.5 rounded-sm text-slate-600 transition-colors duration-150 ease-out hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 motion-reduce:transition-none dark:text-zinc-300 dark:hover:text-cyan-300 dark:focus-visible:ring-cyan-900"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit text
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSavedResume}
                      disabled={isImportingResume}
                      aria-label="Clear saved resume"
                      title="Clear saved resume"
                      className="inline-flex items-center gap-1.5 rounded-sm text-slate-500 transition-colors duration-150 ease-out hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:text-slate-300 motion-reduce:transition-none dark:text-zinc-400 dark:hover:text-rose-300 dark:focus-visible:ring-cyan-900 dark:disabled:text-zinc-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear
                    </button>
                    {resumeImportError ? (
                      <span className="basis-full text-xs font-medium leading-5 text-rose-700 dark:text-rose-300">
                        {resumeImportError}
                      </span>
                    ) : null}
                  </div>
                ) : undefined
              }
              onChange={(value) => {
                setJobDescriptionText(value);
                setInputError(null);
                setAnalysisWarning(null);
              }}
            />
          </div>
        </section>

        <ResultsPanel
          result={getDisplayedResult(result)}
          inputError={inputError}
          analysisWarning={analysisWarning}
          isAnalyzing={isAnalyzing}
          resultVersion={resultVersion}
        />
      </div>
    </main>
  );
}

export default App;
