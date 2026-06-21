import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAnalysisGuardrails,
  applyCandidateJobLevelGuardrails,
  applyFinalConsistencyRepair,
  applyOpportunityQualityGuardrails,
  getExplicitCandidateExperienceYears,
  getRequiredExperienceYears,
  inferCandidateLevel,
  inferJobLevel,
  isPreferredOnlyGap,
  sanitizeUnsupportedReasoningSkills,
} from './analysisPostProcessing.js';

const APPLY = 'Apply \u2705';
const BORDERLINE = 'Borderline \u26a0\ufe0f';
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
      recommendation: BORDERLINE,
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

test('final repair fixes borderline recommendation with top-priority wording', () => {
  const result = applyFinalConsistencyRepair(
    {
      fitScore: 7.2,
      recommendation: BORDERLINE,
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

test('final repair resolves Strong Apply with low opportunity quality', () => {
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

  assert.equal(result.recommendation.startsWith('Apply'), true);
  assert.equal(/Strong Apply|top priority/.test(result.shortReasoning), false);
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

test('junior candidate against senior job is capped to borderline range', () => {
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

  assert.equal(repaired.fitScore, 6.0);
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
  assert.equal(repaired.fitScore, 6.0);
  assert.equal(repaired.recommendation.includes('Skip'), true);
  assert.equal(repaired.interviewChance, '<1%');
  assert.match(repaired.shortReasoning, /experience|seniority/i);
  assert.ok(repaired.criticalGaps.some((gap) => /8\+ years experience requirement not met/i.test(gap)));
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
  assert.equal(repaired.fitScore, 6.0);
  assert.equal(repaired.recommendation.startsWith('Hard Skip'), true);
  assert.equal(repaired.interviewChance, '<1%');
  assert.match(repaired.shortReasoning, /experience|seniority/i);
  assert.ok(repaired.criticalGaps.some((gap) => /8\+ years experience requirement not met/i.test(gap)));
});

test('junior candidate against DriveTime-style 4+ year Azure LLM role is materially capped', () => {
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
  assert.equal(repaired.recommendation.startsWith('Borderline'), true);
  assert.equal(repaired.interviewChance, '1-3%');
  assert.match(repaired.shortReasoning, /experience|seniority/i);
  assert.ok(repaired.criticalGaps.some((gap) => /4\+ years experience requirement not met/i.test(gap)));
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
  assert.equal(repaired.interviewChance, '8-15%');
  assert.equal(repaired.criticalGaps.some((gap) => /2\+ years experience requirement not met/i.test(gap)), false);
});

test('junior candidate against 3-4 year mid role is capped to borderline', () => {
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
  assert.equal(repaired.recommendation.startsWith('Borderline'), true);
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
  assert.equal(result.recommendation.startsWith('Borderline'), true);
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
