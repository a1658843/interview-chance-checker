import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadAnalyzeMatchModule() {
  const files = [
    'src/lib/textUtils.ts',
    'src/lib/scoring.ts',
    'src/lib/applicationRequirements.ts',
    'src/lib/employmentType.ts',
    'src/lib/analyzeMatch.ts',
  ];
  const sourceParts = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  const source = sourceParts
    .join('\n')
    .replace(/^import .*$/gm, '')
    .replace(/export function (?!analyzeMatch)/g, 'function ')
    .replace(/export function analyzeMatch/g, 'function analyzeMatch')
    .replace(/export type .*$/gm, '');
  const { outputText } = ts.transpileModule(`${source}\nexport { analyzeMatch };`, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const dataUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;

  return import(dataUrl);
}

const { analyzeMatch } = await loadAnalyzeMatchModule();

const baseResume = `
Jordan Candidate
jordan@example.com
Skills: React, Python, AWS, SQL
Experience
Software Engineer Intern
Jan 2023 - May 2023
- Built React frontends, Python APIs, and deployed services on AWS.
Education
B.S. Computer Science
`;

function analyze(jobDescription, resumeText = baseResume) {
  return analyzeMatch(resumeText, jobDescription);
}

function interviewChanceUpperBound(interviewChance) {
  const matches = [...String(interviewChance ?? '').matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  return matches.length ? Math.max(...matches) : 0;
}

test('React OR Angular OR Vue is satisfied by React without Angular or Vue gaps', () => {
  const result = analyze(`
    Frontend Software Engineer
    Requirements: Experience with React OR Angular OR Vue.
    Responsibilities include building web application features.
  `);

  assert.ok(result.strongMatches.some((match) => /react/i.test(match.label)));
  assert.equal(result.criticalGaps.some((gap) => /angular|vue/i.test(gap)), false);
  assert.equal(result.missingSkills.some((skill) => /angular|vue/i.test(skill)), false);
  assert.ok(result.jobFitScore > 5);
});

test('Python OR Java OR C# is satisfied by Python without Java or C# gaps', () => {
  const result = analyze(`
    Backend Software Engineer
    Requirements: Experience with Python, Java, or C#.
    Responsibilities include API development and backend services.
  `);

  assert.equal(result.criticalGaps.some((gap) => /java|c#|\.net/i.test(gap)), false);
  assert.equal(result.missingSkills.some((skill) => /java|c#|\.net/i.test(skill)), false);
  assert.ok(result.jobFitScore > 5);
});

test('AWS OR Azure OR GCP is satisfied by AWS without Azure or GCP gaps', () => {
  const result = analyze(`
    DevOps Software Engineer
    Requirements: Experience with AWS, Azure, or GCP.
    Responsibilities include deployment automation and cloud operations.
  `);

  assert.ok(result.strongMatches.some((match) => /aws/i.test(match.label)));
  assert.equal(result.criticalGaps.some((gap) => /azure|gcp|google cloud/i.test(gap)), false);
  assert.equal(result.missingSkills.some((skill) => /azure|gcp|google cloud/i.test(skill)), false);
  assert.ok(result.jobFitScore > 5);
});

test('React plus Node.js still keeps Node.js as a missing required skill', () => {
  const result = analyze(
    `
      Full-stack Software Engineer
      Requirements: React + Node.js.
      Responsibilities include frontend and backend web development.
    `,
    `
      Jordan Candidate
      Skills: React, SQL
      Experience
      Software Engineer Intern
      Jan 2023 - May 2023
      - Built React frontends and SQL-backed web features.
    `,
  );

  assert.ok(result.strongMatches.some((match) => /react/i.test(match.label)));
  assert.ok(result.missingSkills.some((skill) => /javascript|typescript/i.test(skill)));
});

test('BravoTran-style soft example stack does not create critical gaps or skip', () => {
  const result = analyze(
    `
      BravoTran Software Engineer
      We are open to professional work, internships, open-source contributions, academic projects, and personal projects.
      This role is open to multiple levels depending on experience, and we value people who learn quickly.
      Knowledge of or interest in technologies such as Ruby on Rails, Sorbet, PostgreSQL, Elm, Redis, Machine Learning, AWS, and Kubernetes.
      Responsibilities include building product features, APIs, data workflows, and customer-facing software.
    `,
    `
      Jordan Candidate
      Skills: Python, React, PostgreSQL, REST APIs
      Experience
      Software Engineer Intern
      Jan 2023 - May 2023
      - Built Python APIs, React interfaces, and PostgreSQL-backed features for academic and internship projects.
    `,
  );

  assert.equal(result.criticalGaps.some((gap) => /ruby|rails|machine learning|aws|kubernetes/i.test(gap)), false);
  assert.equal(result.recommendation.startsWith('Apply'), true);
  assert.ok(result.jobFitScore >= 6);
});

test('Workerbee talent marketplace caps Strong Apply at Apply and explains marketplace conversion risk', () => {
  const result = analyze(`
    Workerbee Software Engineer Talent Network
    Join our network and build your profile for future opportunities through our matching platform.
    We match candidates with companies seeking React, Python, AWS, and SQL experience.
    Responsibilities may include building product features, APIs, cloud deployments, and data-backed tools.
  `);

  assert.equal(result.companyType, 'Talent Network');
  assert.equal(result.opportunityQuality, 'Medium');
  assert.equal(result.estimatedInterviewChance, '3-7%');
  assert.match(result.reasoning, /candidate pool|marketplace|matching/i);
  assert.ok(result.jobFitScore >= 8);
  assert.equal(result.recommendation, 'Apply ✅');
});

test('Crossing Hurdles-style staffing agency lowers interview chance but keeps Apply for strong fit', () => {
  const result = analyze(`
    Crossing Hurdles Candidate Marketplace
    Create candidate account details to join our talent pool for future matching opportunities.
    Companies in the network often seek Python, React, SQL, and AWS engineers.
    Work may involve API development, frontend delivery, and cloud deployment.
  `);

  assert.equal(result.companyType, 'Staffing Agency');
  assert.equal(result.opportunityQuality, 'Medium');
  assert.equal(result.estimatedInterviewChance, '5-10%');
  assert.ok(
    interviewChanceUpperBound(result.estimatedInterviewChance) <
      interviewChanceUpperBound(
        analyze(`
          Direct employer Software Engineer.
          This product engineering role requires Python, React, SQL, and AWS.
          The team project includes API development, frontend delivery, and cloud deployment.
        `).estimatedInterviewChance,
      ),
  );
  assert.match(result.reasoning, /staffing|recruiting|agency|client/i);
  assert.equal(result.recommendation, 'Apply ✅');
});

test('stealth startup posting is marked suspicious and downgraded one level', () => {
  const result = analyze(`
    Stealth Startup Software Engineer
    No company identity is available yet, but the team needs React, Python, AWS, and SQL.
    Responsibilities include building product features, APIs, cloud infrastructure, and data workflows.
    Compensation range is unusually high for an unspecified early role.
  `);

  assert.equal(result.companyType, 'Suspicious Posting');
  assert.equal(result.opportunityQuality, 'Medium');
  assert.equal(result.estimatedInterviewChance, '3-7%');
  assert.ok(result.jobFitScore >= 6);
  assert.equal(result.recommendation, 'Apply ✅');
});

test('direct employer keeps normal interview chance without employer-type penalty', () => {
  const result = analyze(`
    Direct employer Software Engineer.
    This product engineering role requires Python, React, SQL, and AWS.
    The team project includes API development, frontend delivery, and cloud deployment.
  `);

  assert.equal(result.companyType, 'Direct Employer');
  assert.equal(result.opportunityQuality, 'High');
  assert.equal(result.estimatedInterviewChance, '10-20%');
  assert.equal(result.recommendation.startsWith('Strong Apply'), true);
});

test('Dice-style recruiter posting keeps Apply but caps interview chance', () => {
  const result = analyze(`
    Dice recruiter posting for a client seeking a Software Engineer.
    This contract placement role requires React, Python, AWS, and SQL.
    The client project includes API development, frontend feature delivery, and cloud deployment.
  `);

  assert.equal(result.companyType, 'Staffing Agency');
  assert.equal(result.opportunityQuality, 'Medium');
  assert.equal(result.estimatedInterviewChance, '5-10%');
  assert.ok(result.jobFitScore >= 8);
  assert.equal(result.recommendation, 'Apply ✅');
});
