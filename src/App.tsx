import { useEffect, useState } from 'react';
import { ArrowRight, Info, Loader2, Moon, RotateCcw, Sun, Target } from 'lucide-react';
import { TextInputPanel } from './components/TextInputPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { analyzeMatch } from './lib/analyzeMatch';
import { analyzeWithApi } from './lib/apiAnalysis';
import { extractApplicationRequirements, getEffortLevel } from './lib/applicationRequirements';
import { extractEmploymentType } from './lib/employmentType';
import { validateAnalysisInputs } from './lib/validation';
import type { AnalysisResult } from './types/analysis';

type Theme = 'light' | 'dark';

const themeStorageKey = 'interview-chance-checker-theme';

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
  const [resumeText, setResumeText] = useState('');
  const [jobDescriptionText, setJobDescriptionText] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [resultVersion, setResultVersion] = useState(0);
  const [optimizeForApplicationRoi, setOptimizeForApplicationRoi] = useState(true);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const canAnalyze = resumeText.trim().length > 0 && jobDescriptionText.trim().length > 0 && !isAnalyzing;

  useEffect(() => {
    const isDark = theme === 'dark';

    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

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
    setResumeText('');
    setJobDescriptionText('');
    setResult(null);
    setInputError(null);
    setAnalysisWarning(null);
    setIsAnalyzing(false);
    setResultVersion(0);
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

        <section className="grid gap-4 lg:grid-cols-2">
          <TextInputPanel
            label="Resume Text"
            helper="Paste the resume content as plain text."
            placeholder="Paste resume text here..."
            value={resumeText}
            onChange={(value) => {
              setResumeText(value);
              setInputError(null);
              setAnalysisWarning(null);
            }}
          />
          <TextInputPanel
            label="Job Description"
            helper="Paste the exact job description for the target role."
            placeholder="Paste job description here..."
            value={jobDescriptionText}
            onChange={(value) => {
              setJobDescriptionText(value);
              setInputError(null);
              setAnalysisWarning(null);
            }}
          />
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
