import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAnalysisGuardrails,
  applyCandidateJobLevelGuardrails,
  applyFinalConsistencyRepair,
  applyOpportunityQualityGuardrails,
  getExplicitCandidateExperienceYears,
  getRequiredEducationLevel,
  getRequiredExperienceYears,
  getResumeEducationLevel,
  inferCandidateLevel,
  inferJobLevel,
  isPreferredOnlyGap,
  sanitizeUnsupportedReasoningSkills,
} from './analysisPostProcessing.js';
import { isKnownLowRoiSource } from './knownLowRoiSources.js';

const APPLY = 'Apply \u2705';
const SKIP = 'Skip \u274c';
const STRONG_APPLY = 'Strong Apply \u2705';

function splitReasoningSentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

test('preferred-only IRT experience is not treated as a critical gap', () => {
  const jd = `
    Suvoda builds IRT software for clinical trials.
    Responsibilities include design, develop, build, maintain, and implement software features.
    At least 1 year of experience in IRT or related field preferred.
  `;

  assert.equal(isPreferredOnlyGap('Lack of IRT or clinical trial domain experience', jd), true);
});

test('Suvoda-like direct employer role is recalibrated to high quality and strong fit', () => {
  const jd = `
    Suvoda builds IRT software products for clinical trials.
    This is a full-time Software Developer II role on an engineering team.
    Responsibilities include design, develop, build, maintain, and implement software features.
    At least 1 year of experience in IRT or related field preferred.
  `;
  const result = applyAnalysisGuardrails(
    {
      fitScore: 7.5,
      companyType: 'Direct Employer',
      opportunityQuality: 'Medium',
      strongMatches: ['C#', 'SQL Server', 'Entity Framework', 'MVC', 'REST APIs'],
      criticalGaps: ['Lack of IRT or clinical trial domain experience'],
      shortReasoning:
        'The candidate matches the core stack but lacks IRT or clinical trial domain experience, which is preferred.',
    },
    {
      jobDescriptionText: jd,
      resumeText: 'C# SQL Server Entity Framework MVC REST APIs',
    },
  );

  assert.equal(result.fitScore, 8.5);
  assert.equal(result.opportunityQuality, 'High');
  assert.deepEqual(result.criticalGaps, []);
});

test('unsupported inferred years and seniority critical gaps are removed', () => {
  const jd = `
    Mercor is hiring a software engineer.
    Requirements include Python, React, SQL, and API development.
    Responsibilities include building backend APIs and user-facing features.
  `;
  const result = applyAnalysisGuardrails(
    {
      fitScore: 7,
      companyType: 'Direct Employer',
      opportunityQuality: 'Medium',
      strongMatches: ['Python', 'React', 'SQL'],
      criticalGaps: [
        'Required 3+ years experience not demonstrated',
        'Senior-level experience required',
        'Python',
      ],
      shortReasoning: 'The candidate matches the stack but lacks required 3+ years experience.',
    },
    {
      jobDescriptionText: jd,
      resumeText: 'Python React SQL APIs',
    },
  );

  assert.deepEqual(result.criticalGaps, ['Python']);
});

test('BravoTran-style soft technology interests are not critical gaps', () => {
  const jd = `
    BravoTran Software Engineer.
    We value professional work, internships, open-source contributions, academic projects, and personal projects.
    We hire at multiple levels depending on experience and care about the ability to learn quickly.
    Knowledge of or interest in technologies such as Ruby on Rails, Sorbet, PostgreSQL, Elm, Redis, Machine Learning, AWS, and Kubernetes.
  `;
  const result = applyAnalysisGuardrails(
    {
      fitScore: 5.5,
      recommendation: 'Skip \u274c',
      interviewChance: '8-15%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['Python', 'React', 'PostgreSQL'],
      criticalGaps: [
        'Ruby on Rails experience not demonstrated',
        'Machine Learning experience not demonstrated',
        'AWS and Kubernetes experience not demonstrated',
      ],
      shortReasoning:
        'Skip because Ruby on Rails, Machine Learning, AWS, and Kubernetes are not demonstrated.',
    },
    {
      jobDescriptionText: jd,
      resumeText: 'Python React PostgreSQL academic projects and internship experience.',
    },
  );

  assert.deepEqual(result.criticalGaps, []);
  assert.equal(result.fitScore, 6.5);
  assert.equal(result.interviewChance, '8-15%');
  assert.equal(result.recommendationCap, undefined);
});

test('explicit years critical gaps are preserved when stated by the JD', () => {
  const jd = `
    Requirements
    5+ years software development experience required.
    Python and React experience required.
  `;
  const result = applyAnalysisGuardrails(
    {
      fitScore: 7,
      companyType: 'Direct Employer',
      opportunityQuality: 'Medium',
      strongMatches: ['Python', 'React'],
      criticalGaps: ['5+ years experience requirement not met'],
      shortReasoning: 'The candidate matches the stack but does not meet the 5+ years requirement.',
    },
    {
      jobDescriptionText: jd,
      resumeText: 'Python React SQL APIs',
    },
  );

  assert.ok(result.criticalGaps.some((gap) => /5\+ years experience requirement not met/i.test(gap)));
});

test('staffing agency without specific client or project detail is low quality', () => {
  const jd = `
    HTG is hiring a frontend developer for a client.
    Remote role. Work with a collaborative team on frontend tasks.
    Requirements include React, TypeScript, Vue.js, Node.js, and AWS.
  `;
  const result = applyOpportunityQualityGuardrails(
    {
      companyType: 'Staffing Agency',
      opportunityQuality: 'Medium',
    },
    jd,
  );

  assert.equal(result.opportunityQuality, 'Low');
});

test('staffing agency with specific project detail can remain medium quality', () => {
  const jd = `
    Akkodis is hiring for a specific client project modernizing authentication APIs.
    The project includes migration work, backend integration, and a defined interview process.
  `;
  const result = applyOpportunityQualityGuardrails(
    {
      companyType: 'Staffing Agency',
      opportunityQuality: 'Low',
    },
    jd,
  );

  assert.equal(result.opportunityQuality, 'Medium');
});

test('Workerbee talent network is detected and interview chance is capped', () => {
  const result = applyOpportunityQualityGuardrails(
    {
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      interviewChance: '20-35%',
    },
    `
      Workerbee Talent Network.
      Join our network, build your profile, and get matched with future opportunities.
      Companies may seek React, Python, AWS, and SQL engineers.
    `,
  );

  assert.equal(result.companyType, 'Talent Network');
  assert.equal(result.opportunityQuality, 'Medium');
  assert.equal(result.interviewChance, '3-7%');
});

test('Crossing Hurdles-style posting is detected as staffing agency', () => {
  const result = applyOpportunityQualityGuardrails(
    {
      companyType: 'Unknown',
      opportunityQuality: 'High',
      interviewChance: '10-20%',
    },
    `
      Crossing Hurdles candidate marketplace.
      Create candidate account details to join our talent pool for future matching opportunities.
    `,
  );

  assert.equal(result.companyType, 'Staffing Agency');
  assert.equal(result.opportunityQuality, 'Low');
  assert.equal(result.interviewChance, '5-10%');
});

test('stealth startup posting is detected as suspicious and interview chance is capped', () => {
  const result = applyOpportunityQualityGuardrails(
    {
      companyType: 'Startup',
      opportunityQuality: 'High',
      interviewChance: '20-35%',
    },
    `
      Stealth Startup Software Engineer.
      No company identity is available and the compensation is unusually high for minimal company information.
    `,
  );

  assert.equal(result.companyType, 'Suspicious Posting');
  assert.equal(result.opportunityQuality, 'Medium');
  assert.equal(result.interviewChance, '3-7%');
});

test('Dice-style recruiter posting is detected as staffing agency and interview chance is capped', () => {
  const result = applyOpportunityQualityGuardrails(
    {
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      interviewChance: '20-35%',
    },
    `
      Dice recruiter posting for a client seeking a software engineer.
      The client project includes API development and cloud deployment.
    `,
  );

  assert.equal(result.companyType, 'Staffing Agency');
  assert.equal(result.opportunityQuality, 'Medium');
  assert.equal(result.interviewChance, '5-10%');
});

test('Crossing Hurdles staffing agency chance is capped without soft recommendation downgrade', () => {
  const jd = `
    Crossing Hurdles recruiting agency posting for a client seeking a Software Engineer.
    This staffing partner role requires React, Python, AWS, and SQL.
    The client project includes API development, frontend delivery, and cloud deployment.
  `;
  const guarded = applyOpportunityQualityGuardrails(
    {
      fitScore: 8.5,
      recommendation: APPLY,
      interviewChance: '8-15%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['React', 'Python', 'AWS', 'SQL'],
      criticalGaps: [],
      shortReasoning: 'The candidate has strong technical overlap with the role.',
    },
    jd,
  );
  const repaired = applyFinalConsistencyRepair(guarded, {
    resumeText: 'React Python AWS SQL',
    jobDescriptionText: jd,
  });

  assert.equal(repaired.companyType, 'Staffing Agency');
  assert.equal(repaired.recommendation, STRONG_APPLY);
  assert.equal(repaired.technicalRecommendation, STRONG_APPLY);
  assert.equal(repaired.roiRecommendation, STRONG_APPLY);
  assert.equal(repaired.interviewChance, '5-10%');
  assert.match(repaired.shortReasoning, /staffing|recruiting|agency|client/i);
});

test('Workerbee talent marketplace chance is capped lower than staffing and ROI strategy skips', () => {
  const jd = `
    Workerbee Software Engineer Talent Network.
    Join our network and build your profile for future matching opportunities through our candidate marketplace.
    Companies in the network often seek React, Python, AWS, and SQL engineers.
  `;
  const guarded = applyOpportunityQualityGuardrails(
    {
      fitScore: 8.5,
      recommendation: STRONG_APPLY,
      interviewChance: '8-15%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['React', 'Python', 'AWS', 'SQL'],
      criticalGaps: [],
      shortReasoning: 'The candidate has strong technical overlap with the role.',
    },
    jd,
  );
  const repaired = applyFinalConsistencyRepair(
    {
      ...guarded,
      recommendation: APPLY,
    },
    {
      resumeText: 'React Python AWS SQL',
      jobDescriptionText: jd,
    },
  );

  assert.equal(repaired.companyType, 'Talent Network');
  assert.equal(repaired.recommendation, SKIP);
  assert.equal(repaired.technicalRecommendation, STRONG_APPLY);
  assert.equal(repaired.roiRecommendation, SKIP);
  assert.equal(repaired.interviewChance, '3-7%');
  assert.match(repaired.shortReasoning, /application time|marketplace|project-task/i);
});

test('direct employer keeps interview chance unchanged', () => {
  const result = applyOpportunityQualityGuardrails(
    {
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      interviewChance: '8-15%',
    },
    `
      Direct employer product engineering role.
      The team builds customer software and needs React, Python, AWS, and SQL.
      Responsibilities include API development, frontend delivery, and cloud deployment.
    `,
  );

  assert.equal(result.companyType, 'Direct Employer');
  assert.equal(result.interviewChance, '8-15%');
});

test('short reasoning removes unsupported skill claims', () => {
  const result = sanitizeUnsupportedReasoningSkills(
    {
      shortReasoning:
        'The candidate has strong front-end skills with React, TypeScript, JavaScript, and Node.js, matching most core front-end requirements. However, the candidate lacks Vue.js and AWS experience.',
    },
    'Skills: React, TypeScript, JavaScript, REST APIs',
  );

  assert.equal(result.shortReasoning.includes('Node.js'), false);
  assert.equal(result.shortReasoning.includes('Vue.js'), true);
  assert.equal(result.shortReasoning.includes('AWS'), true);
  assert.match(result.shortReasoning, /React/);
  assert.match(result.shortReasoning, /TypeScript/);
});

test('final repair fixes low opportunity quality with stale medium wording', () => {
  const result = applyFinalConsistencyRepair(
      {
        fitScore: 7.4,
      recommendation: APPLY,
      interviewChance: '3-7%',
      companyType: 'Staffing Agency',
      opportunityQuality: 'Low',
      applicationRequirements: [],
      strongMatches: ['React', 'TypeScript'],
      criticalGaps: ['Vue.js'],
      shortReasoning: 'This is a medium opportunity quality role and worth considering.',
    },
    {
      resumeText: 'React TypeScript',
      jobDescriptionText: 'Generic staffing agency frontend role requiring Vue.js.',
    },
  );

  assert.equal(result.shortReasoning.includes('medium opportunity quality'), false);
  assert.equal(/fit score|interview chance|opportunity quality|critical gaps include/i.test(result.shortReasoning), false);
});

test('final repair fixes staffing agency reasoning that implies direct employer', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 8.2,
      recommendation: APPLY,
      interviewChance: '5-10%',
      companyType: 'Staffing Agency',
      opportunityQuality: 'Medium',
      applicationRequirements: [],
      strongMatches: ['React'],
      criticalGaps: [],
      shortReasoning: 'This direct employer has a strong internal engineering team.',
    },
    {
      resumeText: 'React',
      jobDescriptionText: 'Staffing agency role for a specific client project.',
    },
  );

  assert.equal(/direct employer|internal engineering team/i.test(result.shortReasoning), false);
  assert.equal(/company type|opportunity quality/i.test(result.shortReasoning), false);
});

test('final repair fixes Apply recommendation with top-priority wording', () => {
  const result = applyFinalConsistencyRepair(
      {
        fitScore: 7.2,
      recommendation: APPLY,
      interviewChance: '3-7%',
      companyType: 'Direct Employer',
      opportunityQuality: 'Medium',
      applicationRequirements: [],
      strongMatches: ['Python'],
      criticalGaps: ['AWS'],
      shortReasoning: 'This is a top priority application and a must apply.',
    },
    {
      resumeText: 'Python',
      jobDescriptionText: 'Python role requiring AWS.',
    },
  );

  assert.equal(/top priority|must apply/i.test(result.shortReasoning), false);
  assert.equal(/top priority|must apply/i.test(result.shortReasoning), false);
});

test('final repair removes unsupported Node.js and AWS positive claims', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 7.8,
      recommendation: APPLY,
      interviewChance: '5-10%',
      companyType: 'Direct Employer',
      opportunityQuality: 'Medium',
      applicationRequirements: [],
      strongMatches: ['React', 'TypeScript'],
      criticalGaps: [],
      shortReasoning: 'The candidate has strong React, Node.js, and AWS experience.',
    },
    {
      resumeText: 'React TypeScript',
      jobDescriptionText: 'React role with Node.js and AWS.',
    },
  );

  assert.equal(/Node\.js|AWS/.test(result.shortReasoning), false);
});

test('final repair does not describe a preferred-only domain gap as a blocker', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 8.2,
      recommendation: APPLY,
      interviewChance: '8-15%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['C#', 'SQL Server'],
      criticalGaps: [],
      shortReasoning: 'The preferred IRT experience is a critical blocker and primary weakness.',
    },
    {
      resumeText: 'C# SQL Server',
      jobDescriptionText: 'At least 1 year of experience in IRT or related field preferred.',
    },
  );

  assert.equal(/critical blocker|primary weakness/i.test(result.shortReasoning), false);
});

test('final repair keeps Strong Apply for staffing without strong ROI override signals', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 8.8,
      recommendation: STRONG_APPLY,
      interviewChance: '5-10%',
      companyType: 'Staffing Agency',
      opportunityQuality: 'Low',
      applicationRequirements: [],
      strongMatches: ['React', 'TypeScript'],
      criticalGaps: [],
      shortReasoning: 'Strong Apply because this is a top priority.',
    },
    {
      resumeText: 'React TypeScript',
      jobDescriptionText: 'Generic staffing agency role.',
    },
  );

  assert.equal(result.recommendation, STRONG_APPLY);
  assert.equal(result.technicalRecommendation, STRONG_APPLY);
  assert.equal(result.roiRecommendation, STRONG_APPLY);
  assert.equal(/opportunity quality|fit score|interview chance/i.test(result.shortReasoning), false);
});

test('infers junior candidate from internship and academic project resume', () => {
  const resumeText = 'Computer Science student. Software engineering internship. Academic projects with React and Python.';

  assert.equal(inferCandidateLevel(resumeText), 'Junior');
});

test('infers senior and staff job levels from JD seniority signals', () => {
  assert.equal(
    inferJobLevel('Senior Software Engineer. 5+ years required. Lead architecture and production systems.'),
    'Senior',
  );
  assert.equal(
    inferJobLevel('Principal Architect role. 10+ years and cross-team technical leadership required.'),
    'Staff',
  );
  assert.equal(
    inferJobLevel(
      'Software Engineer. 4+ years required with Azure deployment experience, LLM integration, Semantic Kernel, and LangChain.',
    ),
    'Senior',
  );
  assert.equal(
    inferJobLevel('Software Engineer V. 8+ years required. Lead architecture and approve code standards.'),
    'Staff',
  );
});

test('infers senior and staff from explicit seniority year requirements', () => {
  assert.equal(
    inferJobLevel('Software Engineer. 5+ years experience required building application features.'),
    'Senior',
  );
  assert.equal(
    inferJobLevel('Software Engineer. 8+ years experience required building application features.'),
    'Staff',
  );
});

test('extracts required years only from candidate requirement context', () => {
  assert.equal(
    getRequiredExperienceYears('Requirements: 4+ years of professional software engineering experience.'),
    4,
  );
  assert.equal(getRequiredExperienceYears('Built on a legacy of 40 years in the market.'), null);
  assert.equal(getRequiredExperienceYears('Trusted by customers for over 20 years.'), null);
  assert.equal(getRequiredExperienceYears('Qualifications: 5+ years Java experience.'), 5);
  assert.equal(getRequiredExperienceYears('Preferred qualifications: 5+ years healthcare experience.'), null);
  assert.equal(getRequiredExperienceYears('Requirements: 1–3 years of software engineering experience.'), 1);
  assert.equal(getRequiredExperienceYears('Requirements: 1-3 years of software engineering experience.'), 1);
});

test('extracts candidate years only when explicitly supported by resume text', () => {
  assert.equal(
    getExplicitCandidateExperienceYears('Internships, academic projects, and short contract work with Python and React.'),
    null,
  );
  assert.equal(
    getExplicitCandidateExperienceYears('Software Engineer with 5+ years of professional software development experience.'),
    5,
  );
});

test('extracts required and resume education levels from explicit degree evidence', () => {
  assert.equal(getRequiredEducationLevel("Requirements: Bachelor's degree required."), 1);
  assert.equal(getRequiredEducationLevel("Requirements: Master of Science degree required."), 2);
  assert.equal(getRequiredEducationLevel('Requirements: PhD required.'), 3);
  assert.equal(getResumeEducationLevel('Education: B.S. Computer Science'), 1);
  assert.equal(getResumeEducationLevel('Education: M.S. Computer Science'), 2);
  assert.equal(getResumeEducationLevel('Education: Ph.D. Computer Science'), 3);
});

test("bachelor's resume satisfies bachelor's degree requirement", () => {
  const result = applyCandidateJobLevelGuardrails(
    {
      fitScore: 8.1,
      recommendation: APPLY,
      criticalGaps: [],
    },
    {
      resumeText: 'Education: B.S. Computer Science.',
      jobDescriptionText: "Requirements: Bachelor's degree required.",
    },
  );

  assert.equal(result.criticalGaps.some((gap) => /degree required/i.test(gap)), false);
  assert.equal(result.educationGate, 'Pass');
});

test("bachelor's resume against master's required adds education gap and downgrades recommendation", () => {
  const guarded = applyCandidateJobLevelGuardrails(
    {
      fitScore: 8.4,
      recommendation: APPLY,
      criticalGaps: [],
      shortReasoning: 'The role is worth applying to based on stack overlap.',
    },
    {
      resumeText: 'Education: B.S. Computer Science.',
      jobDescriptionText: "Requirements: Master's degree required.",
    },
  );
  const repaired = applyFinalConsistencyRepair(
    {
      ...guarded,
      recommendation: APPLY,
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['Python'],
    },
    {
      resumeText: 'Education: B.S. Computer Science.',
      jobDescriptionText: "Requirements: Master's degree required.",
    },
  );

  assert.ok(guarded.criticalGaps.some((gap) => /master'?s degree required/i.test(gap)));
  assert.equal(guarded.fitScore, 6.5);
  assert.equal(guarded.interviewChance, '1-2%');
  assert.equal(repaired.recommendation.startsWith('Skip'), true);
  assert.match(repaired.shortReasoning, /degree|education/i);
});

test("bachelor's resume against PhD required adds education gap and skips", () => {
  const guarded = applyCandidateJobLevelGuardrails(
    {
      fitScore: 8.4,
      recommendation: APPLY,
      criticalGaps: [],
      shortReasoning: 'The role is worth applying to based on stack overlap.',
    },
    {
      resumeText: 'Education: B.S. Computer Science.',
      jobDescriptionText: 'Requirements: PhD required.',
    },
  );
  const repaired = applyFinalConsistencyRepair(
    {
      ...guarded,
      recommendation: APPLY,
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['Python'],
    },
    {
      resumeText: 'Education: B.S. Computer Science.',
      jobDescriptionText: 'Requirements: PhD required.',
    },
  );

  assert.ok(guarded.criticalGaps.some((gap) => /phd required|phd degree required/i.test(gap)));
  assert.equal(guarded.fitScore, 3.9);
  assert.equal(guarded.interviewChance, '<1%');
  assert.equal(repaired.recommendation.startsWith('Hard Skip'), true);
  assert.equal(repaired.fitScore, 2.0);
  assert.equal(repaired.interviewChance, '<1%');
  assert.match(repaired.shortReasoning, /degree|education/i);
});

test("master's resume against PhD required adds major education gap and skips", () => {
  const guarded = applyCandidateJobLevelGuardrails(
    {
      fitScore: 8.4,
      recommendation: APPLY,
      criticalGaps: [],
      shortReasoning: 'The role is worth applying to based on stack overlap.',
    },
    {
      resumeText: 'Education: M.S. Computer Science.',
      jobDescriptionText: 'Requirements: PhD required.',
    },
  );
  const repaired = applyFinalConsistencyRepair(
    {
      ...guarded,
      recommendation: APPLY,
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['Python'],
    },
    {
      resumeText: 'Education: M.S. Computer Science.',
      jobDescriptionText: 'Requirements: PhD required.',
    },
  );

  assert.ok(guarded.criticalGaps.some((gap) => /phd required|phd degree required/i.test(gap)));
  assert.equal(guarded.fitScore, 5.0);
  assert.equal(guarded.interviewChance, '1-3%');
  assert.equal(repaired.recommendation.startsWith('Skip'), true);
  assert.equal(repaired.fitScore, 5.0);
  assert.match(repaired.shortReasoning, /degree|education/i);
});

test('preferred advanced education is not treated as a critical gap', () => {
  const mastersPreferred = applyCandidateJobLevelGuardrails(
    {
      fitScore: 8.1,
      recommendation: APPLY,
      criticalGaps: [],
    },
    {
      resumeText: 'Education: B.S. Computer Science.',
      jobDescriptionText: "Bachelor's degree required. Master's degree preferred.",
    },
  );
  const phdPreferred = applyCandidateJobLevelGuardrails(
    {
      fitScore: 8.1,
      recommendation: APPLY,
      criticalGaps: [],
    },
    {
      resumeText: 'Education: B.S. Computer Science.',
      jobDescriptionText: "Bachelor's degree required. PhD preferred.",
    },
  );

  assert.equal(mastersPreferred.criticalGaps.some((gap) => /master|phd|degree required/i.test(gap)), false);
  assert.equal(phdPreferred.criticalGaps.some((gap) => /master|phd|degree required/i.test(gap)), false);
});

test('parenthetical preferred masters degree is not treated as required', () => {
  const result = applyCandidateJobLevelGuardrails(
    {
      fitScore: 8.1,
      recommendation: APPLY,
      criticalGaps: [],
    },
    {
      resumeText: 'Education: B.S. Computer Science.',
      jobDescriptionText: "Requirements: Bachelor's degree required. Master's degree in a related field (preferred).",
    },
  );

  assert.equal(result.criticalGaps.some((gap) => /master|degree required/i.test(gap)), false);
});

test('model-returned masters required gap is removed when masters is preferred only', () => {
  const result = applyAnalysisGuardrails(
    {
      fitScore: 7.5,
      recommendation: APPLY,
      interviewChance: '5-10%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['Python'],
      criticalGaps: ["Master's degree required"],
      shortReasoning: "The candidate has stack overlap but lacks the master's degree.",
    },
    {
      resumeText: 'Education: B.S. Computer Science. Skills: Python.',
      jobDescriptionText: "Requirements: Bachelor's degree required. Master's degree in a related field (preferred).",
    },
  );

  assert.deepEqual(result.criticalGaps, []);
});

test('preferred section masters degree is not treated as required', () => {
  const result = applyCandidateJobLevelGuardrails(
    {
      fitScore: 8.1,
      recommendation: APPLY,
      criticalGaps: [],
    },
    {
      resumeText: 'Education: B.S. Computer Science.',
      jobDescriptionText: `
        Requirements
        Bachelor's degree required.

        Preferred Qualifications
        Master's degree in a related field.
      `,
    },
  );

  assert.equal(result.criticalGaps.some((gap) => /master|degree required/i.test(gap)), false);
});

test('required years plus preferred masters keeps years gap and removes masters gap', () => {
  const result = applyAnalysisGuardrails(
    {
      fitScore: 4.5,
      recommendation: SKIP,
      interviewChance: '<1%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['Python'],
      criticalGaps: ["Master's degree required"],
      shortReasoning: 'The role is much more senior than the resume.',
    },
    {
      resumeText: 'Internship and academic projects with Python.',
      jobDescriptionText: `
        Required Qualifications
        8+ years of software engineering experience

        Preferred Qualifications
        Master's degree in a related field
      `,
    },
  );

  assert.ok(result.criticalGaps.some((gap) => /8\+ years experience requirement not met/i.test(gap)));
  assert.equal(result.criticalGaps.some((gap) => /master/i.test(gap)), false);
});

test('desired skills masters degree is not treated as required', () => {
  const result = applyCandidateJobLevelGuardrails(
    {
      fitScore: 8.1,
      recommendation: APPLY,
      criticalGaps: [],
    },
    {
      resumeText: 'Education: B.S. Computer Science.',
      jobDescriptionText: `
        Requirements
        Bachelor's degree required.

        Desired Skills and Experience
        Masters in related field.
      `,
    },
  );

  assert.equal(result.criticalGaps.some((gap) => /master|degree required/i.test(gap)), false);
});

test('required bachelors degree can remain a critical gap when missing', () => {
  const result = applyCandidateJobLevelGuardrails(
    {
      fitScore: 8.1,
      recommendation: APPLY,
      criticalGaps: [],
    },
    {
      resumeText: 'Skills: Python and React.',
      jobDescriptionText: "Requirements: Bachelor's degree required.",
    },
  );

  assert.ok(result.criticalGaps.some((gap) => /bachelor'?s degree required/i.test(gap)));
});

test('preferred certification is not treated as a critical gap', () => {
  const result = applyAnalysisGuardrails(
    {
      fitScore: 7.5,
      recommendation: APPLY,
      interviewChance: '5-10%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['Azure'],
      criticalGaps: ['Azure Solutions Architect certification required'],
      shortReasoning: 'The candidate has Azure overlap but lacks the certification.',
    },
    {
      resumeText: 'Azure deployment experience.',
      jobDescriptionText: `
        Required Qualifications
        Azure deployment experience.

        Preferred Certifications
        Azure Solutions Architect
      `,
    },
  );

  assert.equal(result.criticalGaps.some((gap) => /azure solutions architect/i.test(gap)), false);
});

test('Ladders-style hard skip reasoning prioritizes experience over preferred masters', () => {
  const resumeText = 'Internship and academic projects with Python and React.';
  const jobDescriptionText = `
    Software Engineer V

    Required Qualifications
    8+ years of software engineering experience.
    Lead architecture and approve code standards.

    Preferred Qualifications
    Master's degree in a related field.
  `;
  const guarded = applyAnalysisGuardrails(
    {
      fitScore: 4.5,
      recommendation: APPLY,
      interviewChance: '3-7%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['Python'],
      criticalGaps: ["Master's degree required"],
      shortReasoning: 'The candidate lacks the advanced education credential.',
    },
    { resumeText, jobDescriptionText },
  );
  const result = applyFinalConsistencyRepair(guarded, { resumeText, jobDescriptionText });

  assert.equal(result.recommendation, 'Hard Skip \u274c\u274c');
  assert.equal(result.interviewChance, '<1%');
  assert.match(result.shortReasoning, /experience|seniority/i);
  assert.equal(/degree|education|master/i.test(result.shortReasoning), false);
  assert.ok(result.criticalGaps.some((gap) => /8\+ years experience requirement not met/i.test(gap)));
  assert.equal(result.criticalGaps.some((gap) => /master/i.test(gap)), false);
});

test('senior role with junior resume reasoning prioritizes experience mismatch first', () => {
  const resumeText = 'Internship and academic projects with Python APIs.';
  const jobDescriptionText = 'Senior Software Engineer. Requirements: 5+ years required. Lead projects and mentor engineers.';
  const guarded = applyAnalysisGuardrails(
    {
      fitScore: 6.4,
      recommendation: APPLY,
      interviewChance: '5-10%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['Python'],
      criticalGaps: [],
      shortReasoning: 'The candidate has some stack overlap.',
    },
    { resumeText, jobDescriptionText },
  );
  const result = applyFinalConsistencyRepair(guarded, { resumeText, jobDescriptionText });

  assert.match(result.shortReasoning, /experience|seniority/i);
  assert.ok(result.criticalGaps.some((gap) => /5\+ years experience requirement not met/i.test(gap)));
});

test('preferred certification does not drive skip reasoning', () => {
  const result = applyFinalConsistencyRepair(
    applyAnalysisGuardrails(
      {
        fitScore: 5.5,
        recommendation: SKIP,
        interviewChance: '1-3%',
        companyType: 'Direct Employer',
        opportunityQuality: 'High',
        applicationRequirements: [],
        strongMatches: ['Azure'],
        criticalGaps: ['Azure Solutions Architect certification required'],
        shortReasoning: 'Skip because the certification is missing.',
      },
      {
        resumeText: 'Azure deployment experience.',
        jobDescriptionText: `
          Required Qualifications
          Azure deployment experience.

          Preferred Certifications
          Azure Solutions Architect
        `,
      },
    ),
    {
      resumeText: 'Azure deployment experience.',
      jobDescriptionText: `
        Required Qualifications
        Azure deployment experience.

        Preferred Certifications
        Azure Solutions Architect
      `,
    },
  );

  assert.equal(result.criticalGaps.some((gap) => /certification|azure solutions architect/i.test(gap)), false);
  assert.equal(/certification|azure solutions architect/i.test(result.shortReasoning), false);
});

test('junior candidate against senior job is capped to Skip', () => {
  const result = applyCandidateJobLevelGuardrails(
    {
      fitScore: 8.8,
      recommendation: STRONG_APPLY,
      criticalGaps: [],
    },
    {
      resumeText: 'Computer Science student with internship and academic projects in Python and React.',
      jobDescriptionText:
        'Senior Software Engineer. 5+ years required. Own architecture, lead projects, and mentor engineers.',
    },
  );

  assert.equal(result.fitScore, 6.8);
  assert.equal(result.recommendationCap.startsWith('Skip'), true);
  assert.equal(result.levelGap, 'Large');
  assert.ok(result.criticalGaps.some((gap) => /experience-level mismatch/i.test(gap)));
  assert.ok(result.criticalGaps.some((gap) => /5\+ years experience requirement not met/i.test(gap)));
});

test('unmet required years are critical gaps unless resume explicitly proves them', () => {
  const missingYears = applyCandidateJobLevelGuardrails(
    {
      fitScore: 8.1,
      recommendation: APPLY,
      criticalGaps: [],
    },
    {
      resumeText: 'Software engineering internships, academic projects, and short contract work with Python.',
      jobDescriptionText: 'Requirements: 4+ years of professional software engineering experience.',
    },
  );
  const provenYears = applyCandidateJobLevelGuardrails(
    {
      fitScore: 8.1,
      recommendation: APPLY,
      criticalGaps: [],
    },
    {
      resumeText: 'Software Engineer with 5+ years of professional software development experience.',
      jobDescriptionText: 'Requirements: 4+ years of professional software engineering experience.',
    },
  );

  assert.ok(missingYears.criticalGaps.some((gap) => /4\+ years experience requirement not met/i.test(gap)));
  assert.equal(provenYears.criticalGaps.some((gap) => /4\+ years experience requirement not met/i.test(gap)), false);
});

test('final repair removes unsupported claims that candidate meets required years', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 7.2,
      recommendation: APPLY,
      interviewChance: '5-10%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['Python'],
      criticalGaps: ['4+ years experience requirement not met'],
      shortReasoning: 'The candidate meets the 4+ years requirement and has strong Python overlap.',
      requiredExperienceYears: 4,
      candidateExperienceYears: null,
    },
    {
      resumeText: 'Internships, academic projects, and short contract work with Python.',
      jobDescriptionText: 'Requirements: 4+ years of professional software engineering experience.',
    },
  );

  assert.equal(/meets the 4\+ years/i.test(result.shortReasoning), false);
  assert.equal(/fit score|interview chance|critical gaps include/i.test(result.shortReasoning), false);
});

test('junior candidate against staff job is skipped', () => {
  const guarded = applyCandidateJobLevelGuardrails(
    {
      fitScore: 9.2,
      recommendation: STRONG_APPLY,
      criticalGaps: [],
      shortReasoning: 'The stack overlaps strongly.',
    },
    {
      resumeText: 'New grad with internship and class projects.',
      jobDescriptionText:
        'Staff Software Engineer / Principal Architect. 10+ years required with cross-team architecture leadership.',
    },
  );
  const repaired = applyFinalConsistencyRepair(
    {
      ...guarded,
      recommendation: STRONG_APPLY,
      interviewChance: '1-3%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['Python'],
    },
    {
      resumeText: 'New grad with internship and class projects.',
      jobDescriptionText:
        'Staff Software Engineer / Principal Architect. 10+ years required with cross-team architecture leadership.',
    },
  );

  assert.equal(repaired.fitScore, 2.5);
  assert.equal(repaired.recommendation.includes('Skip'), true);
  assert.equal(repaired.interviewChance, '<1%');
  assert.match(repaired.shortReasoning, /experience|seniority/i);
  assert.equal('candidateLevel' in repaired, false);
  assert.equal('jobLevel' in repaired, false);
  assert.equal('levelGap' in repaired, false);
});

test('junior candidate against Software Engineer V is skipped even with strong stack overlap', () => {
  const guarded = applyCandidateJobLevelGuardrails(
    {
      fitScore: 9.0,
      recommendation: STRONG_APPLY,
      criticalGaps: [],
      shortReasoning: 'The stack aligns strongly.',
    },
    {
      resumeText: 'One year experience. Internship and academic projects with C# and Python.',
      jobDescriptionText:
        'Software Engineer V. 8+ years required. Lead architecture, approve code standards, and set strategic technical direction.',
    },
  );
  const repaired = applyFinalConsistencyRepair(
    {
      ...guarded,
      recommendation: STRONG_APPLY,
      interviewChance: '3-7%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['C#', 'Python'],
    },
    {
      resumeText: 'One year experience. Internship and academic projects with C# and Python.',
      jobDescriptionText:
        'Software Engineer V. 8+ years required. Lead architecture, approve code standards, and set strategic technical direction.',
    },
  );

  assert.equal(guarded.jobLevel, 'Staff');
  assert.equal(guarded.levelGap, 'Severe');
  assert.equal(repaired.fitScore, 2.5);
  assert.equal(repaired.recommendation.includes('Skip'), true);
  assert.equal(repaired.interviewChance, '<1%');
  assert.match(repaired.shortReasoning, /experience|seniority/i);
  assert.ok(repaired.criticalGaps.some((gap) => /8\+ years experience requirement not met/i.test(gap)));
  assert.equal(repaired.criticalGaps.some((gap) => /severe experience-level mismatch/i.test(gap)), false);
});

test('Ladders-style Software Engineer V regression enforces severe level mismatch after full guardrails', () => {
  const resumeText = `
    Software engineering internship and academic projects.
    Contract work under one year building C#, Python, React, and SQL applications.
    Designed project architecture for a FastAPI prototype and owned class project implementation.
  `;
  const jobDescriptionText = `
    Ladders Software Engineer V.
    Requirements: 8+ years of professional software engineering experience.
    Responsibilities include lead architecture, approve code standards, guide senior engineers,
    and set strategic technical direction for platform services.
  `;
  const guarded = applyAnalysisGuardrails(
    {
      fitScore: 9.2,
      recommendation: STRONG_APPLY,
      interviewChance: '8-15%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['C#', 'Python', 'React', 'SQL'],
      criticalGaps: ['8+ years experience'],
      shortReasoning: 'The candidate has strong technology overlap and should apply.',
    },
    {
      resumeText,
      jobDescriptionText,
    },
  );
  const repaired = applyFinalConsistencyRepair(
    {
      ...guarded,
      recommendation: APPLY,
    },
    {
      resumeText,
      jobDescriptionText,
    },
  );

  assert.equal(guarded.candidateLevel, 'Junior');
  assert.equal(guarded.jobLevel, 'Staff');
  assert.equal(guarded.levelGap, 'Severe');
  assert.equal(guarded.fitScore, 6.0);
  assert.equal(guarded.recommendationCap.includes('Skip'), true);
  assert.equal(repaired.fitScore, 2.5);
  assert.equal(repaired.recommendation.startsWith('Hard Skip'), true);
  assert.equal(repaired.interviewChance, '<1%');
  assert.match(repaired.shortReasoning, /experience|seniority/i);
  assert.ok(repaired.criticalGaps.some((gap) => /8\+ years experience requirement not met/i.test(gap)));
  assert.equal(repaired.criticalGaps.some((gap) => /severe experience-level mismatch/i.test(gap)), false);
});

test('severe seniority mismatch final score is deterministic across different model scores', () => {
  const resumeText = `
    Software engineering internship and academic projects.
    Contract work under one year building C#, Python, React, and SQL applications.
  `;
  const jobDescriptionText = `
    Ladders Software Engineer V.
    Requirements: 8+ years of professional software engineering experience.
    Responsibilities include lead architecture, approve code standards, and set strategic technical direction.
  `;
  const analyzeFromModelScore = (fitScore) => {
    const guarded = applyAnalysisGuardrails(
      {
        fitScore,
        recommendation: APPLY,
        interviewChance: '3-7%',
        companyType: 'Direct Employer',
        opportunityQuality: 'High',
        applicationRequirements: [],
        strongMatches: ['C#', 'Python'],
        criticalGaps: ['8+ years experience'],
        shortReasoning: 'The candidate has some stack overlap.',
      },
      {
        resumeText,
        jobDescriptionText,
      },
    );

    return applyFinalConsistencyRepair(guarded, {
      resumeText,
      jobDescriptionText,
    });
  };
  const first = analyzeFromModelScore(2.5);
  const second = analyzeFromModelScore(3.5);

  assert.equal(first.jobFitScore, undefined);
  assert.equal(first.fitScore, 2.5);
  assert.equal(second.fitScore, 2.5);
  assert.equal(first.recommendation, second.recommendation);
  assert.equal(first.interviewChance, second.interviewChance);
  assert.deepEqual(first.criticalGaps, second.criticalGaps);
});

test('Ladders-style severe mismatch critical gaps are deterministic across noisy model gaps', () => {
  const resumeText = 'Internship and academic projects with Python and React.';
  const jobDescriptionText = `
    Software Engineer V

    Required Qualifications
    8+ years of software engineering experience.
    Lead architecture and approve code standards.

    Preferred Qualifications
    Master's degree in a related field.
    Professional certifications preferred.

    Desired Skills and Experience
    Azure Cloud Services
    Kubernetes
  `;
  const noisyGapRuns = [
    [
      '8+ years experience requirement not met',
      'Azure Cloud Services experience missing',
      'Healthcare domain experience missing',
      'Kubernetes experience missing',
      'Professional certifications preferred but not present',
    ],
    [
      '8+ years experience requirement not met',
      'Azure Cloud Services experience missing',
      'Kubernetes experience missing',
      'Professional certifications preferred but not present',
    ],
    ['8+ years experience requirement not met'],
    ["Master's degree required", 'Azure certification preferred', '8+ years of software engineering experience'],
    ['Severe experience-level mismatch', 'Kubernetes certification preferred'],
  ];

  const results = noisyGapRuns.map((criticalGaps) => {
    const guarded = applyAnalysisGuardrails(
      {
        fitScore: 4.5,
        recommendation: APPLY,
        interviewChance: '3-7%',
        companyType: 'Direct Employer',
        opportunityQuality: 'High',
        applicationRequirements: [],
        strongMatches: ['Python'],
        criticalGaps,
        shortReasoning: 'The candidate has some stack overlap.',
      },
      { resumeText, jobDescriptionText },
    );

    return applyFinalConsistencyRepair(guarded, { resumeText, jobDescriptionText });
  });

  for (const result of results) {
    assert.deepEqual(result.criticalGaps, ['8+ years experience requirement not met']);
    assert.equal(result.criticalGaps.some((gap) => /master|certification|azure|kubernetes/i.test(gap)), false);
    assert.equal(result.recommendation, 'Hard Skip \u274c\u274c');
    assert.equal(result.interviewChance, '<1%');
  }
});

test('junior candidate against DriveTime-style 4+ year Azure LLM role is skipped', () => {
  const guarded = applyCandidateJobLevelGuardrails(
    {
      fitScore: 7.5,
      recommendation: APPLY,
      criticalGaps: ['Azure deployment experience', 'LLM integration experience'],
    },
    {
      resumeText:
        'Software engineering internships, academic projects, and early-career contract experience with C# and React.',
      jobDescriptionText:
        'Software Engineer. 4+ years experience required. Azure deployment experience, LLM integration experience, Semantic Kernel, and LangChain experience required.',
    },
  );
  const repaired = applyFinalConsistencyRepair(
    {
      ...guarded,
      recommendation: APPLY,
      interviewChance: '5-10%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['C#', 'React', 'REST APIs'],
      shortReasoning:
        'The candidate has strong stack overlap and meets the main expectations, making this worth applying to.',
    },
    {
      resumeText:
        'Software engineering internships, academic projects, and early-career contract experience with C# and React.',
      jobDescriptionText:
        'Software Engineer. 4+ years experience required. Azure deployment experience, LLM integration experience, Semantic Kernel, and LangChain experience required.',
    },
  );

  assert.equal(guarded.jobLevel, 'Senior');
  assert.equal(guarded.levelGap, 'Large');
  assert.equal(repaired.fitScore, 5.5);
  assert.equal(repaired.recommendation.startsWith('Skip'), true);
  assert.equal(repaired.interviewChance, '1-3%');
  assert.match(repaired.shortReasoning, /experience|seniority/i);
  assert.ok(repaired.criticalGaps.some((gap) => /4\+ years experience requirement not met/i.test(gap)));
  assert.equal(repaired.criticalGaps.some((gap) => /major experience-level mismatch/i.test(gap)), false);
});

test('BEPC-style junior-friendly role does not trigger experience gate block', () => {
  const resumeText = 'Internship and academic projects with Java, Python, SQL, and web application development.';
  const jobDescriptionText =
    'BEPC Junior Software Engineer. Requirements: 2 years software development experience. Internships or academic projects count toward experience.';
  const guarded = applyAnalysisGuardrails(
    {
      fitScore: 7.4,
      recommendation: APPLY,
      interviewChance: '8-15%',
      companyType: 'Direct Employer',
      opportunityQuality: 'Medium',
      applicationRequirements: [],
      strongMatches: ['Java', 'Python', 'SQL'],
      criticalGaps: [],
      shortReasoning: 'The candidate has relevant junior-level software project experience.',
    },
    {
      resumeText,
      jobDescriptionText,
    },
  );
  const repaired = applyFinalConsistencyRepair(guarded, {
    resumeText,
    jobDescriptionText,
  });

  assert.equal(guarded.experienceGate, 'Pass');
  assert.equal(repaired.recommendation.startsWith('Apply'), true);
  assert.equal(repaired.interviewChance, '3-7%');
  assert.equal(repaired.criticalGaps.some((gap) => /2\+ years experience requirement not met/i.test(gap)), false);
});

test('junior candidate against explicit 3+ year mid role is skipped', () => {
  const guarded = applyCandidateJobLevelGuardrails(
    {
      fitScore: 8.4,
      recommendation: STRONG_APPLY,
      criticalGaps: [],
    },
    {
      resumeText: 'Internship and academic projects with Python APIs.',
      jobDescriptionText: 'Software Engineer II. 3+ years required building production services.',
    },
  );
  const repaired = applyFinalConsistencyRepair(
    {
      ...guarded,
      recommendation: APPLY,
      interviewChance: '5-10%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['Python', 'REST APIs'],
      shortReasoning: 'The candidate has strong stack overlap.',
    },
    {
      resumeText: 'Internship and academic projects with Python APIs.',
      jobDescriptionText: 'Software Engineer II. 3+ years required building production services.',
    },
  );

  assert.equal(repaired.fitScore, 7.5);
  assert.equal(repaired.recommendation.startsWith('Skip'), true);
});

test('large level mismatch final reasoning explicitly mentions experience-level mismatch', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 7.5,
      recommendation: APPLY,
      interviewChance: '1-3%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['Python'],
      criticalGaps: ['Major experience-level mismatch'],
      shortReasoning: 'The role has some stack overlap.',
      candidateLevel: 'Junior',
      jobLevel: 'Senior',
      levelGap: 'Large',
    },
    {
      resumeText: 'Internship and academic projects.',
      jobDescriptionText: 'Senior Software Engineer. 5+ years required.',
    },
  );

  assert.equal(result.fitScore, 6.9);
  assert.equal(result.recommendation.startsWith('Skip'), true);
  assert.match(result.shortReasoning, /experience|seniority/i);
  assert.equal(/strong fit worth applying|top priority/i.test(result.shortReasoning), false);
});

test('Hard Skip reasoning is one short sentence without repeated UI fields', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 6.0,
      recommendation: 'Hard Skip \u274c\u274c',
      interviewChance: '<1%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      strongMatches: ['Python'],
      criticalGaps: ['8+ years experience requirement not met'],
      shortReasoning:
        'Hard Skip because the mismatch is too large. Fit score is 6.0/10 and interview chance is <1%. Critical gaps include 8+ years experience requirement not met.',
      requiredExperienceYears: 8,
      candidateExperienceYears: 1,
      experienceGate: 'Severe Gap',
      levelGap: 'Severe',
    },
    {
      resumeText: 'Internship and academic projects with Python.',
      jobDescriptionText: 'Software Engineer V. Requirements: 8+ years of professional software engineering experience.',
    },
  );

  assert.equal(splitReasoningSentences(result.shortReasoning).length, 1);
  assert.equal(/fit score|interview chance|critical gaps include|strong matches/i.test(result.shortReasoning), false);
});

test('Skip reasoning is compact and does not repeat visible result fields', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 5.5,
      recommendation: SKIP,
      interviewChance: '1-3%',
      companyType: 'Staffing Agency',
      opportunityQuality: 'Low',
      applicationRequirements: [],
      strongMatches: ['React'],
      criticalGaps: ['Core backend requirements missing', 'Cloud deployment experience'],
      shortReasoning:
        'Skip because this is low opportunity quality. Fit score is 5.5/10. Strong matches include React. Critical gaps include backend and cloud.',
    },
    {
      resumeText: 'React',
      jobDescriptionText: 'Backend role requiring cloud deployment.',
    },
  );

  assert.ok(splitReasoningSentences(result.shortReasoning).length <= 2);
  assert.equal(/fit score|interview chance|opportunity quality|strong matches include|critical gaps include/i.test(result.shortReasoning), false);
});

test('mid-level full-stack stack gaps do not become Hard Skip when core overlap exists', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 3.5,
      recommendation: 'Hard Skip \u274c\u274c',
      interviewChance: '3-7%',
      companyType: 'Direct Employer',
      opportunityQuality: 'Medium',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['React', 'TypeScript', 'REST APIs', 'Full Stack development', 'Git'],
      criticalGaps: ['Node.js / Express', 'MongoDB', 'AWS'],
      shortReasoning:
        'Hard Skip because several backend and cloud technologies are missing despite some full-stack overlap.',
    },
    {
      resumeText: 'React TypeScript REST APIs full stack Agile Scrum Git Cursor Copilot',
      jobDescriptionText:
        'CyberGuard Advantage Full-Stack Developer. Requirements include React, TypeScript, REST APIs, Node.js, Express, MongoDB, AWS, Agile/Scrum, Git, and AI coding tools. 2+ years experience preferred.',
    },
  );

  assert.equal(result.recommendation, SKIP);
  assert.equal(result.fitScore, 3.5);
  assert.equal(result.interviewChance, '1-3%');
});

test('final repair prevents Apply at or below 3.5 fit score', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 3.5,
      recommendation: APPLY,
      interviewChance: '3-7%',
      companyType: 'Direct Employer',
      opportunityQuality: 'Medium',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['React', 'TypeScript', 'REST APIs'],
      criticalGaps: ['Node.js', 'MongoDB', 'AWS'],
      shortReasoning:
        'Apply because there is some full-stack overlap, but multiple required technologies are missing.',
    },
    {
      resumeText: 'React TypeScript REST APIs',
      jobDescriptionText: 'Full-stack role requiring React, TypeScript, REST APIs, Node.js, MongoDB, and AWS.',
    },
  );

  assert.equal(result.recommendation, SKIP);
  assert.equal(result.fitScore, 3.5);
  assert.equal(result.interviewChance, '1-3%');
  assert.equal(/^Apply\b/i.test(result.shortReasoning), false);
});

test('final repair prevents Apply when reasoning states a major experience-level mismatch', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 6.2,
      recommendation: APPLY,
      interviewChance: '3-7%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['Python', 'React'],
      criticalGaps: ['Major experience-level mismatch'],
      shortReasoning:
        'Apply because there is stack overlap, but this has a major experience-level mismatch.',
    },
    {
      resumeText: 'Internship and academic projects with Python and React.',
      jobDescriptionText: 'Senior Software Engineer requiring production ownership.',
    },
  );

  assert.equal(result.recommendation, SKIP);
  assert.equal(result.fitScore, 6.2);
  assert.equal(result.interviewChance, '3-7%');
});

test('critical gaps dedupe duplicate years requirement wording', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 2.5,
      recommendation: SKIP,
      interviewChance: '<1%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['Python'],
      criticalGaps: [
        '8+ years experience requirement not met',
        '8+ years of software engineering experience',
        'Python',
      ],
      shortReasoning: 'This role requires significantly more experience than demonstrated by the resume.',
    },
    {
      resumeText: 'Internship and academic projects with Python.',
      jobDescriptionText: 'Software Engineer V. Requirements: 8+ years of professional software engineering experience.',
    },
  );

  assert.deepEqual(result.criticalGaps, ['8+ years experience requirement not met']);
});

test('critical gaps prefer concrete years requirement over generic experience mismatch', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 5.5,
      recommendation: SKIP,
      interviewChance: '1-3%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['React'],
      criticalGaps: [
        'Major experience-level mismatch',
        '4+ years professional experience',
        '4+ years experience requirement not met',
        'Azure deployment experience',
      ],
      shortReasoning: 'The role is above the resume’s demonstrated experience level.',
    },
    {
      resumeText: 'Internship and academic projects with React.',
      jobDescriptionText: 'Requirements: 4+ years professional experience and Azure deployment experience.',
    },
  );

  assert.deepEqual(result.criticalGaps, ['4+ years experience requirement not met', 'Azure deployment experience']);
});

test('final post-processing stabilizes chance and lists for equivalent model outputs', () => {
  const resumeText = 'Python React TypeScript REST APIs PostgreSQL Docker JWT authorization RBAC.';
  const jobDescriptionText = `
    Direct employer Software Engineer role.
    Responsibilities include build Python APIs, React interfaces, authentication features, and PostgreSQL-backed services.
    This is a full-time remote role with specific product engineering responsibilities.
  `;
  const firstGuarded = applyAnalysisGuardrails(
    {
      fitScore: 8.2,
      recommendation: APPLY,
      interviewChance: '1-3%',
      companyType: 'Direct Employer',
      opportunityQuality: 'Medium',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['React', 'Python', 'PostgreSQL', 'Authentication'],
      criticalGaps: ['Docker'],
      shortReasoning: 'The candidate has strong overlap with the core work.',
    },
    { resumeText, jobDescriptionText },
  );
  const secondGuarded = applyAnalysisGuardrails(
    {
      fitScore: 8.2,
      recommendation: STRONG_APPLY,
      interviewChance: '3-7%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['Authentication', 'PostgreSQL', 'Python', 'React'],
      criticalGaps: ['Docker'],
      shortReasoning: 'This is a strong apply because the core work maps well.',
    },
    { resumeText, jobDescriptionText },
  );
  const first = applyFinalConsistencyRepair(firstGuarded, { resumeText, jobDescriptionText });
  const second = applyFinalConsistencyRepair(secondGuarded, { resumeText, jobDescriptionText });

  assert.equal(first.fitScore, second.fitScore);
  assert.equal(first.recommendation, second.recommendation);
  assert.equal(first.interviewChance, second.interviewChance);
  assert.deepEqual(first.strongMatches, second.strongMatches);
  assert.deepEqual(first.criticalGaps, second.criticalGaps);
});

test('AfterQuery-style talent network is skipped when ROI optimization is on', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 7.2,
      recommendation: APPLY,
      interviewChance: '5-10%',
      companyType: 'Talent Network',
      opportunityQuality: 'Medium',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['Python', 'React', 'REST APIs'],
      criticalGaps: [],
      shortReasoning: 'The resume has useful technical overlap.',
    },
    {
      resumeText: 'Python React REST APIs.',
      jobDescriptionText: 'AfterQuery talent marketplace profile pool for software engineering opportunities.',
      optimizeForApplicationRoi: true,
    },
  );

  assert.equal(result.jobFitScore, undefined);
  assert.equal(result.fitScore, 7.2);
  assert.equal(result.recommendation, SKIP);
  assert.match(result.shortReasoning, /return on application effort/i);
});

test('AfterQuery-style talent network can apply when ROI optimization is off', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 7.2,
      recommendation: SKIP,
      interviewChance: '3-7%',
      companyType: 'Talent Network',
      opportunityQuality: 'Medium',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['Python', 'React', 'REST APIs'],
      criticalGaps: [],
      shortReasoning: 'The resume has useful technical overlap.',
    },
    {
      resumeText: 'Python React REST APIs.',
      jobDescriptionText: 'AfterQuery talent marketplace profile pool for software engineering opportunities.',
      optimizeForApplicationRoi: false,
    },
  );

  assert.equal(result.fitScore, 7.2);
  assert.equal(result.recommendation, APPLY);
});

test('ROI mode changes only recommendation and reasoning for talent networks', () => {
  const analysis = {
    fitScore: 6.5,
    recommendation: APPLY,
    interviewChance: '3-7%',
    companyType: 'Talent Network',
    opportunityQuality: 'Medium',
    applicationRequirements: [],
    effortLevel: 'Low',
    strongMatches: ['Python', 'React', 'REST APIs'],
    criticalGaps: [],
    shortReasoning: 'The technical fit is reasonable and the experience requirements are largely aligned.',
  };
  const context = {
    resumeText: 'Python React REST APIs.',
    jobDescriptionText: 'Talent marketplace project-based software engineering opportunity.',
  };
  const roiOff = applyFinalConsistencyRepair(analysis, {
    ...context,
    optimizeForApplicationRoi: false,
  });
  const roiOn = applyFinalConsistencyRepair(analysis, {
    ...context,
    optimizeForApplicationRoi: true,
  });

  assert.equal(roiOff.fitScore, roiOn.fitScore);
  assert.equal(roiOff.interviewChance, roiOn.interviewChance);
  assert.deepEqual(roiOff.strongMatches, roiOn.strongMatches);
  assert.deepEqual(roiOff.criticalGaps, roiOn.criticalGaps);
  assert.equal(roiOff.recommendation, APPLY);
  assert.equal(roiOn.recommendation, SKIP);
  assert.notEqual(roiOff.shortReasoning, roiOn.shortReasoning);
  assert.equal(roiOn.technicalRecommendation, APPLY);
  assert.equal(roiOn.roiRecommendation, SKIP);
});

test('AfterQuery-style project platform is classified as Talent Network and ROI toggle changes recommendation', () => {
  const resumeText = 'Junior software engineer with Python, React, REST APIs, PostgreSQL, and project experience.';
  const jobDescriptionText = `
    AfterQuery Software Engineering Contributor
    Requirements: 1–3 years of software engineering experience.
    This is a project-based role where tasks are assigned project-by-project.
    Projects are usually 10–20 hours/week for 2–3 weeks.
    Work spans a variety of stacks and applications, supports AI labs, and gives exposure to real-world engineering problems.
    The work can help with portfolio building through research lab and task-style engineering work.
  `;
  const rawAnalysis = {
    fitScore: 7.2,
    recommendation: APPLY,
    interviewChance: '8-15%',
    companyType: 'Direct Employer',
    opportunityQuality: 'High',
    applicationRequirements: [],
    effortLevel: 'Low',
    strongMatches: ['Python', 'React', 'REST APIs'],
    criticalGaps: ['Major experience-level mismatch', '3+ years experience requirement not met'],
    shortReasoning: 'The resume has useful technical overlap.',
  };
  const guarded = applyAnalysisGuardrails(rawAnalysis, { resumeText, jobDescriptionText });
  const roiOn = applyFinalConsistencyRepair(guarded, {
    resumeText,
    jobDescriptionText,
    optimizeForApplicationRoi: true,
  });
  const roiOff = applyFinalConsistencyRepair(guarded, {
    resumeText,
    jobDescriptionText,
    optimizeForApplicationRoi: false,
  });

  assert.equal(guarded.companyType, 'Talent Network');
  assert.equal(roiOn.companyType, 'Talent Network');
  assert.equal(roiOn.fitScore, roiOff.fitScore);
  assert.equal(roiOn.interviewChance, roiOff.interviewChance);
  assert.deepEqual(roiOn.strongMatches, roiOff.strongMatches);
  assert.deepEqual(roiOn.criticalGaps, roiOff.criticalGaps);
  assert.equal(roiOn.recommendation, SKIP);
  assert.equal(roiOff.recommendation, APPLY);
  assert.match(roiOn.shortReasoning, /application time|talent marketplace|project-task/i);
  assert.equal(roiOn.criticalGaps.some((gap) => /major experience-level mismatch/i.test(gap)), false);
  assert.equal(roiOff.criticalGaps.some((gap) => /major experience-level mismatch/i.test(gap)), false);
  assert.equal(roiOn.criticalGaps.some((gap) => /3\+ years experience requirement not met/i.test(gap)), false);
  assert.equal(roiOff.criticalGaps.some((gap) => /3\+ years experience requirement not met/i.test(gap)), false);
});

test('known low-ROI posting source overrides recommendation without changing technical fields', () => {
  const resumeText = 'Python React REST APIs SQL.';
  const jobDescriptionText = `
    Company: Mercor
    Software Engineer
    Build Python APIs, React interfaces, and SQL-backed product features.
  `;
  const guarded = applyAnalysisGuardrails(
    {
      fitScore: 7.6,
      recommendation: APPLY,
      interviewChance: '3-7%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['Python', 'React', 'REST APIs'],
      criticalGaps: [],
      shortReasoning: 'The technical fit is reasonable.',
    },
    { resumeText, jobDescriptionText },
  );
  const roiOff = applyFinalConsistencyRepair(guarded, {
    resumeText,
    jobDescriptionText,
    optimizeForApplicationRoi: false,
  });
  const roiOn = applyFinalConsistencyRepair(guarded, {
    resumeText,
    jobDescriptionText,
    optimizeForApplicationRoi: true,
  });

  assert.equal(roiOn.postingSource, 'Mercor');
  assert.equal(roiOff.postingSource, 'Mercor');
  assert.equal(roiOff.recommendation, APPLY);
  assert.equal(roiOn.recommendation, SKIP);
  assert.equal(roiOff.fitScore, roiOn.fitScore);
  assert.equal(roiOff.interviewChance, roiOn.interviewChance);
  assert.deepEqual(roiOff.strongMatches, roiOn.strongMatches);
  assert.deepEqual(roiOff.criticalGaps, roiOn.criticalGaps);
  assert.match(roiOn.shortReasoning, /source associated with consistently low application ROI/i);
});

test('known low-ROI source matching tolerates punctuation and naming differences', () => {
  const result = applyFinalConsistencyRepair(
    applyAnalysisGuardrails(
      {
        fitScore: 7.1,
        recommendation: APPLY,
        interviewChance: '3-7%',
        companyType: 'Direct Employer',
        opportunityQuality: 'High',
        applicationRequirements: [],
        effortLevel: 'Low',
        strongMatches: ['Python', 'React'],
        criticalGaps: [],
        shortReasoning: 'The technical fit is reasonable.',
      },
      {
        resumeText: 'Python React.',
        jobDescriptionText: 'Posting Source: FetchJobs\nSoftware Engineer role with Python and React.',
      },
    ),
    {
      resumeText: 'Python React.',
      jobDescriptionText: 'Posting Source: FetchJobs\nSoftware Engineer role with Python and React.',
      optimizeForApplicationRoi: true,
    },
  );

  assert.equal(result.postingSource, 'FetchJobs');
  assert.equal(result.recommendation, SKIP);
});

function analyzeLinkedInKnownSourceSnippet(source, { technicalRecommendation = APPLY, aboutCompany = 'Boeing' } = {}) {
  const resumeText = 'Python React REST APIs SQL.';
  const jobDescriptionText = `
    ${source}
    Share
    Show more options
    Software Engineer
    United States · Remote · Full-time

    About The Company
    ${aboutCompany} builds enterprise products.

    About the job
    Build Python APIs, React interfaces, and SQL-backed product features.
  `;
  const guarded = applyAnalysisGuardrails(
    {
      fitScore: 7.6,
      recommendation: technicalRecommendation,
      interviewChance: '3-7%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['Python', 'React', 'REST APIs'],
      criticalGaps: [],
      shortReasoning:
        technicalRecommendation === SKIP
          ? 'The technical fit is limited because a core requirement is missing.'
          : 'The technical fit is reasonable.',
    },
    { resumeText, jobDescriptionText },
  );

  return {
    roiOff: applyFinalConsistencyRepair(guarded, {
      resumeText,
      jobDescriptionText,
      optimizeForApplicationRoi: false,
    }),
    roiOn: applyFinalConsistencyRepair(guarded, {
      resumeText,
      jobDescriptionText,
      optimizeForApplicationRoi: true,
    }),
  };
}

test('real LinkedIn FetchJobs.co snippet keeps top posting source over About The Company', () => {
  const { roiOn, roiOff } = analyzeLinkedInKnownSourceSnippet('FetchJobs.co', { aboutCompany: 'Boeing' });

  assert.equal(roiOn.postingSource, 'FetchJobs.co');
  assert.equal(roiOff.postingSource, 'FetchJobs.co');
  assert.equal(roiOn.recommendation, SKIP);
  assert.match(roiOn.shortReasoning, /source associated with consistently low application ROI/i);
  assert.equal(roiOn.fitScore, roiOff.fitScore);
  assert.equal(roiOn.interviewChance, roiOff.interviewChance);
  assert.deepEqual(roiOn.strongMatches, roiOff.strongMatches);
  assert.deepEqual(roiOn.criticalGaps, roiOff.criticalGaps);
});

test('real LinkedIn Mercor snippet uses known low-ROI source explanation even for technical Skip', () => {
  const { roiOn } = analyzeLinkedInKnownSourceSnippet('Mercor', { technicalRecommendation: SKIP });

  assert.equal(roiOn.postingSource, 'Mercor');
  assert.equal(roiOn.recommendation, SKIP);
  assert.match(roiOn.shortReasoning, /source associated with consistently low application ROI/i);
});

test('real LinkedIn Hire Feed snippet triggers known low-ROI source filter', () => {
  const { roiOn } = analyzeLinkedInKnownSourceSnippet('Hire Feed');

  assert.equal(roiOn.postingSource, 'Hire Feed');
  assert.equal(roiOn.recommendation, SKIP);
  assert.match(roiOn.shortReasoning, /source associated with consistently low application ROI/i);
});

test('exact Hire Feed LinkedIn paste returns ROI Skip while ROI off keeps technical recommendation', () => {
  const resumeText = 'React TypeScript JavaScript REST APIs SQL CSS HTML.';
  const jobDescriptionText = `
    Hire Feed
    Share
    Show more options
    UI Engineer (Remote)
    United States · Remote · Full-time

    About the job
    Hiring for one of our clients. Build modern user interfaces with React, TypeScript, JavaScript, CSS, and REST API integration.
  `;
  const guarded = applyAnalysisGuardrails(
    {
      fitScore: 8.6,
      recommendation: STRONG_APPLY,
      interviewChance: '5-10%',
      companyType: 'Staffing Agency',
      opportunityQuality: 'Medium',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['React', 'TypeScript', 'JavaScript', 'REST APIs'],
      criticalGaps: [],
      shortReasoning: 'Strong technical fit for the UI role.',
    },
    { resumeText, jobDescriptionText },
  );
  const roiOn = applyFinalConsistencyRepair(guarded, {
    resumeText,
    jobDescriptionText,
    optimizeForApplicationRoi: true,
  });
  const roiOff = applyFinalConsistencyRepair(guarded, {
    resumeText,
    jobDescriptionText,
    optimizeForApplicationRoi: false,
  });

  assert.equal(guarded.postingSource, 'Hire Feed');
  assert.equal(isKnownLowRoiSource(guarded.postingSource), true);
  assert.equal(roiOn.postingSource, 'Hire Feed');
  assert.equal(roiOn.technicalRecommendation, STRONG_APPLY);
  assert.equal(roiOn.roiRecommendation, SKIP);
  assert.equal(roiOn.recommendation, SKIP);
  assert.match(roiOn.shortReasoning, /source associated with consistently low application ROI/i);
  assert.equal(roiOff.recommendation, STRONG_APPLY);
  assert.equal(roiOn.fitScore, roiOff.fitScore);
  assert.equal(roiOn.interviewChance, roiOff.interviewChance);
  assert.deepEqual(roiOn.strongMatches, roiOff.strongMatches);
  assert.deepEqual(roiOn.criticalGaps, roiOff.criticalGaps);
});

test('known low-ROI source never softens technical Hard Skip', () => {
  const resumeText = 'Internship and academic projects with React, TypeScript, JavaScript, REST APIs, SQL, CSS, and HTML.';
  const jobDescriptionText = `
    Hire Feed
    Share
    Show more options
    Software Engineer V (Remote)
    United States 路 Remote 路 Full-time

    About the job
    Hiring for one of our clients. Build modern user interfaces with React, TypeScript, JavaScript, CSS, and REST API integration.
    Requirements: 8+ years of professional software engineering experience.
    Responsibilities include lead architecture, approve code standards, and guide senior engineers.
  `;
  const guarded = applyAnalysisGuardrails(
    {
      fitScore: 2.5,
      recommendation: STRONG_APPLY,
      interviewChance: '<1%',
      companyType: 'Staffing Agency',
      opportunityQuality: 'Medium',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['React', 'TypeScript'],
      criticalGaps: ['8+ years experience requirement not met'],
      shortReasoning: 'The resume has technical overlap and should apply.',
    },
    { resumeText, jobDescriptionText },
  );
  const roiOn = applyFinalConsistencyRepair(guarded, {
    resumeText,
    jobDescriptionText,
    optimizeForApplicationRoi: true,
  });
  const roiOff = applyFinalConsistencyRepair(guarded, {
    resumeText,
    jobDescriptionText,
    optimizeForApplicationRoi: false,
  });

  assert.equal(roiOn.postingSource, 'Hire Feed');
  assert.equal(roiOff.recommendation, 'Hard Skip \u274c\u274c');
  assert.equal(roiOn.recommendation, 'Hard Skip \u274c\u274c');
  assert.equal(roiOn.roiRecommendation, 'Hard Skip \u274c\u274c');
  assert.match(roiOn.shortReasoning, /source associated with consistently low application ROI/i);
  assert.equal(roiOn.fitScore, roiOff.fitScore);
  assert.equal(roiOn.interviewChance, roiOff.interviewChance);
  assert.deepEqual(roiOn.strongMatches, roiOff.strongMatches);
  assert.deepEqual(roiOn.criticalGaps, roiOff.criticalGaps);
});

test('real LinkedIn Jobright.ai snippet triggers known low-ROI source filter', () => {
  const { roiOn } = analyzeLinkedInKnownSourceSnippet('Jobright.ai');

  assert.equal(roiOn.postingSource, 'Jobright.ai');
  assert.equal(roiOn.recommendation, SKIP);
  assert.match(roiOn.shortReasoning, /source associated with consistently low application ROI/i);
});

test('real LinkedIn Ladders snippet triggers known low-ROI source filter', () => {
  const { roiOn } = analyzeLinkedInKnownSourceSnippet('Ladders');

  assert.equal(roiOn.postingSource, 'Ladders');
  assert.equal(roiOn.recommendation, SKIP);
  assert.match(roiOn.shortReasoning, /source associated with consistently low application ROI/i);
});

test('Hire Feed-style client intermediary is staffing, not direct employer, without automatic Apply-to-Skip downgrade', () => {
  const resumeText = 'React TypeScript REST APIs SQL.';
  const jobDescriptionText = `
    Hire Feed is hiring for one of our clients.
    The role is a software engineering position with React, TypeScript, APIs, and database work.
    The client has a normal recruiter review process.
  `;
  const guarded = applyAnalysisGuardrails(
    {
      fitScore: 7.4,
      recommendation: APPLY,
      interviewChance: '8-15%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['React', 'TypeScript', 'REST APIs'],
      criticalGaps: [],
      shortReasoning: 'The technical fit is reasonable.',
    },
    { resumeText, jobDescriptionText },
  );
  const result = applyFinalConsistencyRepair(guarded, {
    resumeText,
    jobDescriptionText,
    optimizeForApplicationRoi: true,
  });

  assert.equal(result.companyType, 'Staffing Agency');
  assert.equal(result.recommendation, APPLY);
});

test('labeled Hire Feed posting source is independently filtered even when employer type is staffing', () => {
  const resumeText = 'React TypeScript REST APIs SQL.';
  const jobDescriptionText = `
    Company: Hire Feed
    Hiring for one of our clients.
    The role is a software engineering position with React, TypeScript, APIs, and database work.
  `;
  const guarded = applyAnalysisGuardrails(
    {
      fitScore: 7.4,
      recommendation: APPLY,
      interviewChance: '5-10%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['React', 'TypeScript', 'REST APIs'],
      criticalGaps: [],
      shortReasoning: 'The technical fit is reasonable.',
    },
    { resumeText, jobDescriptionText },
  );
  const result = applyFinalConsistencyRepair(guarded, {
    resumeText,
    jobDescriptionText,
    optimizeForApplicationRoi: true,
  });

  assert.equal(result.postingSource, 'Hire Feed');
  assert.equal(result.companyType, 'Staffing Agency');
  assert.equal(result.recommendation, SKIP);
});

test('Robert Half remains staffing without known-source ROI skip', () => {
  const resumeText = 'React TypeScript REST APIs SQL.';
  const jobDescriptionText = `
    Company: Robert Half
    Robert Half staffing agency is hiring for a specific client project.
    The role includes React, TypeScript, APIs, and SQL.
  `;
  const result = applyFinalConsistencyRepair(
    applyAnalysisGuardrails(
      {
        fitScore: 7.4,
        recommendation: APPLY,
        interviewChance: '5-10%',
        companyType: 'Direct Employer',
        opportunityQuality: 'High',
        applicationRequirements: [],
        effortLevel: 'Low',
        strongMatches: ['React', 'TypeScript', 'REST APIs'],
        criticalGaps: [],
        shortReasoning: 'The technical fit is reasonable.',
      },
      { resumeText, jobDescriptionText },
    ),
    { resumeText, jobDescriptionText, optimizeForApplicationRoi: true },
  );

  assert.equal(result.postingSource, 'Robert Half');
  assert.equal(result.companyType, 'Staffing Agency');
  assert.equal(result.recommendation, APPLY);
});

test('Motion Recruitment remains staffing without known-source ROI skip', () => {
  const resumeText = 'React TypeScript REST APIs SQL.';
  const jobDescriptionText = `
    Company: Motion Recruitment
    Motion Recruitment staffing agency is hiring for a specific client project.
    The role includes React, TypeScript, APIs, and SQL.
  `;
  const result = applyFinalConsistencyRepair(
    applyAnalysisGuardrails(
      {
        fitScore: 7.4,
        recommendation: APPLY,
        interviewChance: '5-10%',
        companyType: 'Direct Employer',
        opportunityQuality: 'High',
        applicationRequirements: [],
        effortLevel: 'Low',
        strongMatches: ['React', 'TypeScript', 'REST APIs'],
        criticalGaps: [],
        shortReasoning: 'The technical fit is reasonable.',
      },
      { resumeText, jobDescriptionText },
    ),
    { resumeText, jobDescriptionText, optimizeForApplicationRoi: true },
  );

  assert.equal(result.postingSource, 'Motion Recruitment');
  assert.equal(result.companyType, 'Staffing Agency');
  assert.equal(result.recommendation, APPLY);
});

test('Hire Feed-style client intermediary with high-friction unknown-client signals can downgrade to Skip', () => {
  const resumeText = 'React TypeScript REST APIs SQL.';
  const jobDescriptionText = `
    Hire Feed is hiring for one of our clients with an unknown end client.
    Candidates must complete an AI interview before human review and create a profile before matching.
    The role involves React, TypeScript, APIs, and database work.
  `;
  const guarded = applyAnalysisGuardrails(
    {
      fitScore: 7.4,
      recommendation: APPLY,
      interviewChance: '8-15%',
      companyType: 'Direct Employer',
      opportunityQuality: 'High',
      applicationRequirements: [],
      effortLevel: 'Low',
      strongMatches: ['React', 'TypeScript', 'REST APIs'],
      criticalGaps: [],
      shortReasoning: 'The technical fit is reasonable.',
    },
    { resumeText, jobDescriptionText },
  );
  const result = applyFinalConsistencyRepair(guarded, {
    resumeText,
    jobDescriptionText,
    optimizeForApplicationRoi: true,
  });

  assert.equal(result.companyType, 'Staffing Agency');
  assert.equal(result.recommendation, SKIP);
  assert.match(result.shortReasoning, /intermediary|uncertain interview conversion|application time/i);
});

test('direct employer recommendation is stable across ROI toggle', () => {
  const analysis = {
    fitScore: 8.4,
    recommendation: STRONG_APPLY,
    interviewChance: '8-15%',
    companyType: 'Direct Employer',
    opportunityQuality: 'High',
    applicationRequirements: [],
    effortLevel: 'Low',
    strongMatches: ['Python', 'React', 'REST APIs'],
    criticalGaps: [],
    shortReasoning: 'The resume aligns well with the role.',
  };
  const context = {
    resumeText: 'Python React REST APIs.',
    jobDescriptionText: 'Direct employer product engineering role with clear responsibilities.',
  };
  const roiOn = applyFinalConsistencyRepair(analysis, {
    ...context,
    optimizeForApplicationRoi: true,
  });
  const roiOff = applyFinalConsistencyRepair(analysis, {
    ...context,
    optimizeForApplicationRoi: false,
  });

  assert.equal(roiOn.fitScore, roiOff.fitScore);
  assert.equal(roiOn.interviewChance, roiOff.interviewChance);
  assert.deepEqual(roiOn.strongMatches, roiOff.strongMatches);
  assert.deepEqual(roiOn.criticalGaps, roiOff.criticalGaps);
  assert.equal(roiOn.recommendation, roiOff.recommendation);
  assert.equal(roiOn.shortReasoning, roiOff.shortReasoning);
});

test('ROI mode never upgrades a technical recommendation', () => {
  const analysis = {
    fitScore: 5.4,
    recommendation: SKIP,
    interviewChance: '1-3%',
    companyType: 'Talent Network',
    opportunityQuality: 'Medium',
    applicationRequirements: [],
    effortLevel: 'Low',
    strongMatches: ['Python', 'React'],
    criticalGaps: ['Core backend ownership not demonstrated'],
    shortReasoning: 'The technical fit is limited because a core requirement is missing.',
  };
  const result = applyFinalConsistencyRepair(analysis, {
    resumeText: 'Python React.',
    jobDescriptionText: 'Talent marketplace project-based backend opportunity.',
    optimizeForApplicationRoi: true,
  });

  assert.equal(result.technicalRecommendation, SKIP);
  assert.equal(result.recommendation, SKIP);
  assert.equal(result.roiRecommendation, SKIP);
});
