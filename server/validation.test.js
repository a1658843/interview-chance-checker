import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadValidationModule() {
  const source = await readFile('src/lib/validation.ts', 'utf8');
  const sourceWithInlineDependency = source.replace(
    "import { normalizeText } from './textUtils';",
    "function normalizeText(value: string) { return value.toLowerCase().replace(/[^a-z0-9+#.\\s-]/g, ' '); }",
  );
  const { outputText } = ts.transpileModule(sourceWithInlineDependency, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const dataUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;

  return import(dataUrl);
}

const {
  textLooksLikeJobPosting,
  textLooksLikeResume,
  validateAnalysisInputs,
} = await loadValidationModule();

const resumeText = `
Jordan Candidate
jordan.candidate@example.com | 555-123-4567 | github.com/jordancandidate | linkedin.com/in/jordancandidate

Skills
React, TypeScript, Node.js, SQL

Experience
Software Engineer Intern, ExampleCo
Jan 2023 - May 2023
- Built React and API features for internal users.

Education
B.S. Computer Science, Example University
`;

test('Paylocity-style LinkedIn job description is accepted as a job posting', () => {
  const paylocityJobDescription = `
Job Type
Full-time

Description
Paylocity is an award-winning provider of cloud-based HR and payroll software solutions.

Position Overview
The Software Engineer builds and maintains applications used by customers and internal teams.

Core Responsibilities
- Design, develop, test, and maintain software features.
- Collaborate with product managers, designers, and other engineers.
- Troubleshoot production issues and improve application reliability.

Education And Experience
- Bachelor's degree in Computer Science, Engineering, or equivalent practical experience.
- 2+ years of professional software development experience preferred.

Technical Skills
- Experience with C#, JavaScript, SQL, APIs, and modern web application development.
- Familiarity with cloud platforms, automated testing, and agile development practices.

Physical Requirements
Ability to remain stationary for periods of time and use standard office equipment.

Pay range
$80,000 - $120,000 annually, depending on experience and location.

Company description
Paylocity provides human capital management software and is an equal opportunity employer.
If you need assistance or an accommodation due to a disability, contact LeaveBenefits@paylocity.com.
`;

  assert.equal(textLooksLikeResume(paylocityJobDescription), false);
  assert.equal(textLooksLikeJobPosting(paylocityJobDescription), true);
  assert.equal(validateAnalysisInputs(resumeText, paylocityJobDescription), null);
});

test('resume-like text in job description still triggers swapped-field validation', () => {
  const error = validateAnalysisInputs('Responsibilities: build APIs and collaborate with engineers.', resumeText);

  assert.match(error ?? '', /resume content/i);
});
