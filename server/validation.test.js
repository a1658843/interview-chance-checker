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
  getAnalysisInputValidationDebug,
  shouldShowValidationDebug,
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

test('The City Tutors LinkedIn volunteer JD is accepted as a job posting', () => {
  const cityTutorsJobDescription = `
LinkedIn Job Posting

Title: UNPAID VOLUNTEER - Front End Engineer
Company: The City Tutors
Location: United States
Workplace: Remote
Source: LinkedIn

Job Description:
About the job
The City Tutors is seeking an unpaid volunteer Front End Engineer to support education technology projects.

Responsibilities
- Build responsive user interfaces for web applications.
- Collaborate with designers, product volunteers, and backend engineers.
- Improve accessibility, usability, and performance.

Qualifications
- Experience with HTML, CSS, JavaScript, and React.
- Familiarity with Git, responsive design, and component-based development.
- Strong communication skills and interest in supporting students.

Education
- Computer science coursework or equivalent practical experience preferred.

Skills
- Front-end development
- React
- CSS
- JavaScript
`;

  assert.equal(textLooksLikeResume(cityTutorsJobDescription), false);
  assert.equal(textLooksLikeJobPosting(cityTutorsJobDescription), true);
  assert.equal(validateAnalysisInputs(resumeText, cityTutorsJobDescription), null);
});

test('adpanel extension-formatted LinkedIn job URL is accepted as job metadata', () => {
  const adpanelJobDescription = `
LinkedIn Job Posting

Title: Frontend Developer
Company: adpanel
Location: United States
Employment Type: Contract
Workplace Type: Remote
Source: LinkedIn
URL: https://www.linkedin.com/jobs/view/1234567890/

Job Description:
About the job
adpanel is hiring a Frontend Developer to build modern web interfaces.

Required Skills & Qualifications
- 2+ years' experience in frontend development.
- Strong experience with React, JavaScript, HTML, CSS, Git, and Agile workflows.
- Experience with Next.js.
`;

  assert.equal(textLooksLikeResume(adpanelJobDescription), false);
  assert.equal(textLooksLikeJobPosting(adpanelJobDescription), true);
  assert.equal(validateAnalysisInputs(resumeText, adpanelJobDescription), null);

  const debug = getAnalysisInputValidationDebug(resumeText, adpanelJobDescription);
  assert.equal(debug.jobDescriptionValidationDebug.normalizedLength > 0, true);
  assert.equal(debug.jobDescriptionValidationDebug.isLinkedInJobPayload, true);
  assert.deepEqual(debug.jobDescriptionValidationDebug.detectedResumeSignals, [
    'linkedin_jobs_url',
    'url_numeric_segment',
  ]);
  assert.ok(debug.jobDescriptionValidationDebug.detectedJobSignals.includes('job_title_metadata'));
  assert.ok(debug.jobDescriptionValidationDebug.detectedJobSignals.includes('company_metadata'));
  assert.ok(debug.jobDescriptionValidationDebug.detectedJobSignals.includes('job_description_metadata'));
  assert.equal(debug.jobDescriptionValidationDebug.triggeredRule, null);
});

test('adpanel real extension-style LinkedIn payload with page chrome is accepted', () => {
  const adpanelExtensionJobDescription = `
LinkedIn Job Posting

Title: Frontend Developer
Company: adpanel
Location: United States
Employment Type: Contract
Workplace Type: Remote
Source: LinkedIn
URL: https://www.linkedin.com/jobs/view/frontend-developer-adpanel/

Job Description:
Frontend Developer
adpanel
United States
Share
Show more options

About the job
We are looking for a Frontend Developer to help build responsive advertising technology dashboards.

Responsibilities
- Build reusable UI components with React, JavaScript, HTML, and CSS.
- Collaborate with designers and backend engineers in an agile environment.
- Maintain frontend code quality with Git-based workflows.

Required Skills & Qualifications
- 2+ years' experience in frontend development.
- Strong experience with React, JavaScript, HTML, CSS, Git, and Agile workflows.
- Experience with Next.js.

Education
- Bachelor's degree in Computer Science or equivalent experience preferred.
`;

  const debug = getAnalysisInputValidationDebug(resumeText, adpanelExtensionJobDescription);

  assert.equal(textLooksLikeResume(adpanelExtensionJobDescription), false);
  assert.equal(textLooksLikeJobPosting(adpanelExtensionJobDescription), true);
  assert.equal(validateAnalysisInputs(resumeText, adpanelExtensionJobDescription), null);
  assert.equal(debug.jobDescriptionValidationDebug.isLinkedInJobPayload, true);
  assert.ok(debug.jobDescriptionValidationDebug.detectedResumeSignals.includes('linkedin_jobs_url'));
  assert.equal(debug.jobDescriptionValidationDebug.detectedResumeSignals.includes('phone_number'), false);
  assert.ok(debug.jobDescriptionValidationDebug.detectedJobSignals.includes('linkedin_job_header'));
  assert.ok(debug.jobDescriptionValidationDebug.detectedJobSignals.includes('linkedin_jobs_url'));
  assert.ok(debug.jobDescriptionValidationDebug.detectedJobSignals.includes('responsibilities_section'));
  assert.ok(debug.jobDescriptionValidationDebug.detectedJobSignals.includes('qualifications_section'));
  assert.equal(debug.jobDescriptionValidationDebug.resumeLikeTriggeredRule, null);
  assert.equal(debug.jobDescriptionValidationDebug.triggeredRule, null);
});

test('adpanel extension handoff with GitHub repository URL is accepted as a job description', () => {
  const adpanelExtensionJobDescription = `
LinkedIn Job Posting

Title: Frontend Developer
Company: adpanel
Location: United States
Employment Type: Contract
Workplace Type: Remote
Source: LinkedIn
URL: https://www.linkedin.com/jobs/view/1234567890/

Job Description:
About the job
adpanel is looking for a Frontend Developer to contribute to an open source advertising platform.
Project repository: https://github.com/punch-t/adpanel-core

Responsibilities
- Build reusable frontend components with React, JavaScript, HTML, and CSS.
- Collaborate with designers and backend engineers.

Qualifications
- 2+ years' experience in frontend development.
- Experience with Git, Agile workflows, and Next.js.
`;

  const debug = getAnalysisInputValidationDebug(resumeText, adpanelExtensionJobDescription, 'extension_handoff');

  assert.equal(textLooksLikeResume(adpanelExtensionJobDescription, 'extension_handoff'), false);
  assert.equal(textLooksLikeJobPosting(adpanelExtensionJobDescription), true);
  assert.equal(validateAnalysisInputs(resumeText, adpanelExtensionJobDescription, 'extension_handoff'), null);
  assert.equal(debug.jobDescriptionValidationDebug.isLinkedInJobPayload, true);
  assert.equal(debug.jobDescriptionValidationDebug.triggeredRule, null);
  assert.ok(debug.jobDescriptionValidationDebug.detectedResumeSignals.includes('github_repository_url'));
  assert.equal(debug.jobDescriptionValidationDebug.detectedResumeSignals.includes('github_profile_url'), false);
  assert.equal(debug.jobDescriptionValidationDebug.detectedResumeSignals.includes('personal_profile_url'), false);
});

test('LinkedIn extension job with recruiting email and GitHub repository URL is accepted', () => {
  const linkedInJobDescription = `
LinkedIn Job Posting

Title: Software Engineer
Company: Example Co
Location: Remote
Source: LinkedIn
URL: https://www.linkedin.com/jobs/view/9876543210/

Job Description:
About the job
Example Co is hiring a Software Engineer for a product team.
Open source repository: https://github.com/example/example-product

Responsibilities
- Build APIs and user-facing features.

Qualifications
- Experience with React, APIs, and SQL.

For recruiting questions, contact recruiting@example.com.
`;

  assert.equal(validateAnalysisInputs(resumeText, linkedInJobDescription, 'extension_handoff'), null);
  const debug = getAnalysisInputValidationDebug(resumeText, linkedInJobDescription, 'extension_handoff');
  assert.equal(debug.jobDescriptionValidationDebug.triggeredRule, null);
  assert.ok(debug.jobDescriptionValidationDebug.detectedResumeSignals.includes('github_repository_url'));
  assert.equal(debug.jobDescriptionValidationDebug.detectedResumeSignals.includes('github_profile_url'), false);
});

test('LinkedIn extension job with numeric LinkedIn jobs URL is accepted', () => {
  const linkedInJobDescription = `
LinkedIn Job Posting

Title: Frontend Developer
Company: Example Co
Location: United States
Source: LinkedIn
URL: https://www.linkedin.com/jobs/view/3958472610/

Job Description:
About the job
Example Co is hiring a Frontend Developer.

Responsibilities
- Build React interfaces.

Qualifications
- Experience with JavaScript, HTML, and CSS.
`;

  const debug = getAnalysisInputValidationDebug(resumeText, linkedInJobDescription, 'extension_handoff');

  assert.equal(validateAnalysisInputs(resumeText, linkedInJobDescription, 'extension_handoff'), null);
  assert.equal(debug.jobDescriptionValidationDebug.phoneLikeUrlIgnored, true);
  assert.ok(debug.jobDescriptionValidationDebug.detectedResumeSignals.includes('url_numeric_segment'));
  assert.equal(debug.jobDescriptionValidationDebug.detectedResumeSignals.includes('phone_number'), false);
});

test('extension LinkedIn job wrapper remains accepted when company metadata is missing', () => {
  const linkedInJobWithoutCompanyMetadata = `
LinkedIn Job Posting

Title: Frontend Developer
Location: United States
Source: LinkedIn
URL: https://www.linkedin.com/jobs/view/frontend-developer-adpanel/

Job Description:
About the job
adpanel is hiring a Frontend Developer.

Responsibilities
- Build React interfaces.

Qualifications
- 2+ years' experience in frontend development.
- Experience with Next.js.
`;

  const debug = getAnalysisInputValidationDebug(resumeText, linkedInJobWithoutCompanyMetadata);

  assert.equal(debug.jobDescriptionValidationDebug.isLinkedInJobPayload, true);
  assert.equal(textLooksLikeResume(linkedInJobWithoutCompanyMetadata), false);
  assert.equal(textLooksLikeJobPosting(linkedInJobWithoutCompanyMetadata), true);
  assert.equal(validateAnalysisInputs(resumeText, linkedInJobWithoutCompanyMetadata), null);
});

test('LinkedIn job posting with resume-like section labels is accepted as a JD', () => {
  const linkedInJobDescription = `
LinkedIn Job Posting

Title: Software Engineer
Company: Example Product Co
Location: Remote
Source: LinkedIn

Job Description:
Responsibilities
- Develop product features across frontend and backend services.
- Participate in code reviews and production support.

Skills
- TypeScript, React, APIs, SQL, automated testing.

Qualifications
- 2+ years of software engineering experience.
- Experience building customer-facing web applications.

Education
- Bachelor's degree in Computer Science or equivalent experience preferred.
`;

  assert.equal(textLooksLikeResume(linkedInJobDescription), false);
  assert.equal(textLooksLikeJobPosting(linkedInJobDescription), true);
  assert.equal(validateAnalysisInputs(resumeText, linkedInJobDescription), null);
});

test('resume pasted into both fields still triggers protective validation', () => {
  const error = validateAnalysisInputs(resumeText, resumeText);

  assert.match(error ?? '', /both fields appear to contain resume content/i);
});

test('development validation debug is safe and available for both-fields resume failure', () => {
  const debug = getAnalysisInputValidationDebug(resumeText, resumeText, 'extension_handoff');
  const serializedDebug = JSON.stringify(debug);

  assert.equal(debug.jobDescriptionValidationDebug.inputSource, 'extension_handoff');
  assert.equal(debug.jobDescriptionValidationDebug.triggeredRule, 'both_fields_resume_content');
  assert.equal(shouldShowValidationDebug(true, debug), true);
  assert.equal(shouldShowValidationDebug(false, debug), false);
  assert.ok(debug.jobDescriptionValidationDebug.resumeLength > 0);
  assert.ok(debug.jobDescriptionValidationDebug.normalizedLength > 0);
  assert.ok(debug.resume.detectedResumeSignals.includes('personal_email'));
  assert.ok(debug.jobDescriptionValidationDebug.detectedResumeSignals.includes('personal_email'));

  assert.equal(serializedDebug.includes('Jordan Candidate'), false);
  assert.equal(serializedDebug.includes('jordan.candidate@example.com'), false);
  assert.equal(serializedDebug.includes('555-123-4567'), false);
  assert.equal(serializedDebug.includes('github.com/jordancandidate'), false);
  assert.equal(serializedDebug.includes('linkedin.com/in/jordancandidate'), false);
});

test('validation debug is not shown for non-target validation outcomes', () => {
  const debug = getAnalysisInputValidationDebug('Responsibilities: build APIs.', resumeText, 'manual_paste');

  assert.notEqual(debug.jobDescriptionValidationDebug.triggeredRule, 'both_fields_resume_content');
  assert.equal(shouldShowValidationDebug(true, debug), false);
});

test('resume with personal LinkedIn profile URL is still resume-like', () => {
  const resumeWithLinkedInProfile = `
Jordan Candidate
jordan.candidate@example.com | linkedin.com/in/jordancandidate

Skills
React, TypeScript, JavaScript

Experience
Software Engineer Intern, ExampleCo
Jan 2023 - May 2023

Education
B.S. Computer Science, Example University
`;

  assert.equal(textLooksLikeResume(resumeWithLinkedInProfile), true);
});

test('resume-like extension payload with personal profile and work history is still rejected', () => {
  const resumeLikePayload = `
LinkedIn Job Posting

Title: Frontend Developer
Company: Candidate Portfolio
Source: LinkedIn

Job Description:
Jordan Candidate
jordan.candidate@example.com | 555-123-4567 | github.com/jordancandidate | linkedin.com/in/jordancandidate

Skills
React, TypeScript, JavaScript

Experience
Frontend Developer, ExampleCo
Jan 2023 - May 2024
- Built frontend components.

Education
B.S. Computer Science, Example University
`;

  assert.match(
    validateAnalysisInputs(resumeText, resumeLikePayload, 'extension_handoff') ?? '',
    /both fields appear to contain resume content/i,
  );
  assert.equal(textLooksLikeResume(resumeLikePayload, 'extension_handoff'), true);
});

test('job posting with recruiting contact email is not treated as resume content', () => {
  const jobDescriptionWithRecruitingEmail = `
Job Description
We are hiring a Front End Engineer to build accessible user interfaces for a nonprofit education platform.

Responsibilities
- Build reusable React components.
- Work with product and design teams.

Qualifications
- Experience with JavaScript, HTML, CSS, and responsive design.
- Familiarity with accessibility standards.

Education
- Computer science coursework or equivalent practical experience preferred.

To request an accommodation or ask a recruiting question, contact recruiting@example.org.
`;

  assert.equal(textLooksLikeResume(jobDescriptionWithRecruitingEmail), false);
  assert.equal(validateAnalysisInputs(resumeText, jobDescriptionWithRecruitingEmail), null);
});

test('resume-like text in job description still triggers swapped-field validation', () => {
  const error = validateAnalysisInputs('Responsibilities: build APIs and collaborate with engineers.', resumeText);

  assert.match(error ?? '', /resume content/i);
});
