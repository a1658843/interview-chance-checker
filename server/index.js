import 'dotenv/config';
import http from 'node:http';
import OpenAI from 'openai';
import {
  allowedApplicationRequirements,
  applyApplicationRequirements,
  effortLevels,
} from './applicationRequirements.js';
import { employmentTypes, extractEmploymentType } from './employmentType.js';
import {
  applyAnalysisGuardrails,
  applyFinalConsistencyRepair,
} from './analysisPostProcessing.js';
import { normalizeStrongMatches } from './strongMatches.js';

const port = Number(process.env.API_PORT ?? 8787);
const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const analysisSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'fitScore',
    'recommendation',
    'interviewChance',
    'marketCompetition',
    'jobLogistics',
    'companyType',
    'opportunityQuality',
    'employmentType',
    'strongMatches',
    'applicationRequirements',
    'effortLevel',
    'criticalGaps',
    'shortReasoning',
  ],
  properties: {
    fitScore: {
      type: 'number',
      minimum: 0,
      maximum: 10,
      description:
        'Resume-to-role fit score from 0.0 to 10.0. Evaluate stack, responsibilities, seniority, and domain only; do not include company type, opportunity quality, application effort, or application requirements.',
    },
    recommendation: {
      type: 'string',
      enum: ['Strong Apply ✅', 'Apply ✅', 'Skip ❌', 'Hard Skip ❌❌'],
    },
    interviewChance: {
      type: 'string',
      description:
        'First-round recruiter or HR screener move-forward probability for this exact applicant pool. Use a realistic range such as <1%, 1-3%, 3-7%, 5-10%, 8-15%, 15-25%, or 25%+.',
    },
    marketCompetition: {
      type: 'string',
      enum: ['Low', 'Medium', 'High', 'Very High'],
    },
    jobLogistics: {
      type: 'string',
      description:
        'Concrete job logistics only, such as Remote · Full-time · Easy Apply or Hybrid · Contract · External Apply · Travel required.',
    },
    companyType: {
      type: 'string',
      enum: ['Direct Employer', 'Staffing Agency', 'Talent Network', 'Suspicious Posting', 'Consulting', 'Startup', 'Unknown'],
      description:
        'Classify the employer/opportunity source. Use Talent Network for talent communities, matching platforms, candidate marketplaces, future opportunities, Workerbee-style networks, and profile-building pools. Use Suspicious Posting for stealth/confidential/no-identity postings, unrealistic compensation, minimal company information, or generic copied responsibilities. This must not change fitScore or applicationRequirements, but it can inform interviewChance and recommendation.',
    },
    opportunityQuality: {
      type: 'string',
      enum: ['High', 'Medium', 'Low'],
      description:
        'Rate the clarity and quality of the hiring opportunity itself. This must not change fitScore or applicationRequirements, but it can inform the final recommendation. Talent Network and Suspicious Posting classifications are handled through companyType; do not double-penalize them here.',
    },
    employmentType: {
      type: 'string',
      enum: [...employmentTypes, 'Unknown'],
      description:
        'Objective primary employment type explicitly stated or clearly supported by the job description. Use Unknown when not stated clearly.',
    },
    strongMatches: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'string',
      },
    },
    applicationRequirements: {
      type: 'array',
      description:
        'Explicit extra application steps only. Do not include skill gaps, years of experience, seniority mismatch, domain requirements, cloud, AI/LLM, platform requirements, travel, authorization, sponsorship, or security clearance.',
      items: {
        type: 'string',
        enum: allowedApplicationRequirements,
      },
    },
    effortLevel: {
      type: 'string',
      enum: effortLevels,
      description:
        'Application effort level: Low for resume-only standard applications, Medium for custom questions or one light extra step, High for an assessment, coding challenge, or take-home project, and Very High for coding challenge plus video submission or multiple major extra steps.',
    },
    criticalGaps: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Only explicit JD requirements or directly implied named technology/domain gaps. Never invent years, seniority, lead-level, communication, or professional-experience requirements.',
    },
    shortReasoning: {
      type: 'string',
    },
  },
};

const systemPrompt = `
You are an expert software engineering recruiter and resume reviewer.

Compare a resume to a software engineering job description.

Return only the JSON fields required by the schema.

Rules:
- This app is not an ATS keyword checker and is not deciding whether the company should hire the candidate.
- The core question is: should the candidate realistically spend time applying to this job?
- fitScore measures only the candidate's resume-to-role fit. Focus on stack, responsibilities, seniority, and domain. Do not include companyType, opportunityQuality, application effort, applicationRequirements, or company quality in fitScore.
- recommendation is the final application decision. It should additionally account for application effort, companyType, opportunityQuality, and expected interview return per hour spent.
- Always evaluate the actual resume against the actual job description. Never hardcode a score or recommendation from the job title, company, category, or example name alone.
- Estimate actual recruiter interest, not keyword completeness. Recruiters often interview candidates who match the core requirements even when several secondary or nice-to-have requirements are missing.
- Core requirements should dominate scoring. First identify the job's primary technologies, primary responsibilities, required seniority, and strongest hiring signals. If the candidate matches most of those core requirements, start from a strong score and adjust from there.
- Explicit hiring priorities should receive extra weight. Give significant scoring weight to requirements introduced by phrases such as "focused on 3 core things", "must-have skills", "bread and butter", "key qualifications", "primary responsibilities", "what you will do", "you will be responsible for", and "required qualifications".
- Nice-to-have, preferred, bonus, plus, familiarity, exposure, or secondary skills should not heavily reduce fit. Missing bonus tools, optional frameworks, supporting technologies, or preferred-only domain experience should only make a small adjustment when the primary stack and responsibilities match.
- Never put clearly preferred-only qualifications in criticalGaps. Preferred-only domain experience may be mentioned in shortReasoning as a learnable gap, but it should not pull a strong core-stack match below 8.0.
- Distinguish core technology mismatch from secondary skill gaps. Missing the primary stack or primary responsibility is a major issue; missing a supporting tool is not.
- Treat a role as a hard blocker only when the JD requires core experience and the candidate's resume lacks that core experience. If the candidate has strong evidence for the core platform/language/domain, score it as a potential fit even if the role category is specialized.
- Do not treat every missing JD requirement equally. Distinguish hard blockers from learnable gaps.
- Hard blockers should heavily reduce fitScore: iOS role with no Swift/iOS experience; Android role with no Android/Kotlin experience; Flowable/Camunda/BPM role with no BPM experience; Edifecs/EDI role with no EDI experience; Java-only role with no Java experience; 10+ or 15+ years required when the candidate has less than 2 years; security clearance required and the candidate lacks it; fully onsite or relocation required when the candidate needs remote.
- Evaluate career level separately from technology fit. A junior candidate can match the stack well and still be a poor fit for Senior, Staff, Principal, Architect, Engineer IV, Engineer V, or 8+ year leadership roles.
- Infer candidate level from explicit resume evidence: Junior = internships, academic projects, short contract work under about 2 years, and little ownership; Mid = 2-5 years or independent production feature delivery; Senior = 5+ years, architecture decisions, mentoring, or technical leadership; Staff = staff/principal/architect titles, organization-wide influence, or strategic architecture ownership.
- Infer job level from title and responsibilities: Junior = junior, entry level, new grad, or 0-2 years; Mid = Engineer II/III or 2-5 years; Senior = Senior, Lead, Engineer IV, 5+ years, architecture ownership, mentoring, or technical leadership; Staff = Staff, Principal, Architect, Engineer V, 8+ years, approving code standards, lead architecture, organization-wide ownership, or strategic technical direction.
- Apply career-level penalties after technical fit scoring. Typical penalties: Junior to Mid -0.5 to -1.0, Junior to Senior -2.0, Junior to Staff -3.0, Mid to Staff -2.0, Senior to Staff -1.0.
- Career-level mismatch must cap recommendation realism. Junior to Senior should not exceed Skip. Junior to Staff, Principal, Architect, or Engineer V should be Skip even when technology overlap is strong.
- Never claim the candidate has, meets, satisfies, or demonstrates a years-of-experience requirement unless the resume explicitly states that amount of professional experience. Do not infer 4+ or 5+ years from internships, academic projects, bootcamp projects, short contract work, graduation dates, or general skill breadth.
- If the JD requires a specific amount of professional experience and the resume does not explicitly demonstrate that amount, list the years requirement as a critical gap instead of saying the candidate meets it.
- Learnable gaps should reduce fitScore moderately, not catastrophically: healthcare domain, HIPAA, cloud platform, GraphQL, some AI/LLM application experience, 3+ years required when the candidate has around 1-2 years and otherwise matches the core stack, and preferred domain experience.
- Score 9.0-10.0 when the candidate directly matches the primary stack, primary responsibilities, seniority expectations, and domain/hiring priorities.
- Score 8.0-9.0 when the candidate matches the primary stack and responsibilities but misses a few supporting tools, optional technologies, or nice-to-have skills.
- Score 7.0-8.0 when the candidate is a strong plausible fit for the main work but has one or two meaningful, learnable gaps.
- Score 6.0-7.0 when the candidate matches about half of the important requirements or has moderate overlap with the core work.
- Score below 6.0 when the candidate lacks the primary stack, primary responsibility, required platform, required domain blocker, or required seniority.
- Score 4.0-5.9 for low expected return on application time.
- Score 0.0-3.9 for major fit mismatch, but do not automatically make that a Hard Skip when several core technologies/responsibilities match and the application is low effort.
- recommendation must optimize for total application value, not fitScore alone. Allowed labels are only "Strong Apply ✅", "Apply ✅", "Skip ❌", and "Hard Skip ❌❌". Do not output any other recommendation label. A high fit score does not automatically mean "Strong Apply ✅". Fit >= 8.0 plus High opportunity quality should usually be "Strong Apply ✅" when interview chance and application effort are reasonable. Fit >= 8.0 plus Medium or Low opportunity quality should usually be "Apply ✅", not "Strong Apply ✅". Fit 7.0-7.9 should usually be "Apply ✅" unless the role is not worth normal application time. Fit 6.5 plus low effort and Direct Employer can be "Apply ✅". Fit below 6.0 should be "Skip ❌" unless there is real stack overlap and low application effort, in which case use "Apply ✅". Fit 5.5 should be "Skip ❌".
- Hard Skip ❌❌ is reserved for extreme mismatch only: sub-1% realistic interview chance, explicit seniority mismatch such as 8+ years/Staff/Principal/Architect/Lead when the resume is junior, PhD-level specialist roles without the degree, security-clearance defense specialization without clearance, embedded systems with no embedded background, or extreme core-stack mismatch such as iOS/Swift with no iOS/Swift evidence, Android/Kotlin with none, Golang backend with no backend experience, or Data Scientist with no ML background. Do not use Hard Skip for mid-level full-stack roles where React/TypeScript/full-stack/API experience matches and the missing items are supporting backend/cloud/database tools such as Node.js, Express, MongoDB, or AWS.
- The following examples are illustrative calibration anchors only. Do not hardcode decisions from these names or categories; always re-evaluate the actual resume and JD.
- Curana-like calibration: Python backend + Software Engineer II + remote + AI application role, but missing healthcare, LLM depth, and 3+ years, should usually score around 7.0-8.0 and recommend Apply because it is plausibly worth the candidate applying.
- Akkodis-like calibration: Python backend role where the core priorities are Python APIs and authentication; if the candidate directly matches the primary stack and responsibilities, missing AWS-specific services or optional domain experience should not heavily reduce fit and should usually score around 8.0-9.0.
- iOS calibration: Swift/iOS required and the candidate has none should score around 0.5-2.0 and recommend Hard Skip; Swift/iOS required and the candidate has strong Swift/iOS evidence may be Apply or Strong Apply.
- EDI/Edifecs calibration: Java + Edifecs + EDI X12 + payer domain required and the candidate has none should score around 1.0-3.0 and recommend Hard Skip; strong evidence in those requirements should raise the score.
- AHEAD-like calibration: 4+ years, AI/LLM integration, AWS/cloud, GraphQL; the candidate matches Python/React/API but lacks seniority and AI/cloud depth, should usually score around 5.5-6.5 and recommend Skip or Apply depending on wording.
- PHP/Laravel challenge calibration: PHP/Laravel plus coding challenge/video; the candidate has a builder profile but lacks PHP/Laravel and may not want to spend time on the challenge, should usually score around 4.0-6.0 and recommend Skip unless fit is otherwise very high.
- interviewChance is separate from fitScore. Do not simply convert fitScore into interviewChance.
- For interviewChance, act as the first-round recruiter or HR screener for the company or hiring agency described in the JD. Ask: "If this resume came through my applicant pool for this exact role, how likely would I be to move this candidate to an interview?"
- Estimate interviewChance from the screener's perspective using: core requirement match, obvious screening filters, years of experience, domain preference, remote/Easy Apply/applicant-volume competition, companyType, whether the JD is generic or specific, and whether the role appears to be a real active opening or a pipeline posting.
- A high fitScore can still have a low interviewChance if the posting is remote, highly competitive, generic, staffing-agency sourced, pipeline-like, or domain-specific.
- Return interviewChance as a realistic range, such as "<1%", "1-3%", "3-7%", "5-10%", "8-15%", "15-25%", or "25%+".
- jobLogistics must summarize only concrete facts from the JD: Remote/Hybrid/Onsite, Full-time/Contract/Internship, Easy Apply/External Apply/Challenge-based, and Travel if present. Use a compact format like "Remote · Full-time · Easy Apply". Do not include vague labels such as posting pressure, competition, or applicant pressure. If a fact is not stated, omit that part. If no logistics are stated, use "Not specified".
- companyType must not affect fitScore or applicationRequirements. Use "Direct Employer" when the company appears to be hiring for its own product/team, "Staffing Agency" for recruiters/staffing vendors and contract placement firms including Dice-style recruiter postings, "Talent Network" for talent communities, Workerbee-style matching platforms, candidate marketplaces, join-our-network/talent-pool/future-opportunity/profile-building posts, "Suspicious Posting" for stealth startup/confidential/no-company-identity postings, unrealistic compensation, minimal company information, or generic copied responsibilities, "Consulting" for consulting/client-services firms, "Startup" for startup employers, and "Unknown" when unclear.
- opportunityQuality must not affect fitScore or applicationRequirements. Use only "High", "Medium", or "Low". Use "High" for direct employers with a clear real product or team, specific responsibilities, credible active hiring need, and strong opportunity quality. Use "Medium" for reasonable opportunities with some uncertainty, such as reputable staffing agencies with specific client/project details, talent networks or suspicious postings that are already identified by companyType, direct employers with limited job detail, or hidden-client postings where the JD is specific enough. Use "Low" for generic staffing/recruiting posts, no specific product/team/client, vague entry-level JDs, unclear real openings, or generic remote Easy Apply postings with little concrete role detail.
- employmentType must be one primary value from Full-Time, Part-Time, Contract, Part-Time Contract, Full-Time Contract, Contract-to-Hire, Internship, or Unknown. Only use a concrete value when it is explicitly stated or clearly supported by the JD. If both Part-time and Contract are explicitly present, use Part-Time Contract. If both Full-time and Contract are explicitly present, use Full-Time Contract. Never infer employment type from company reputation or assumptions.
- shortReasoning must be consistent with recommendation. Never return "Strong Apply ✅" while saying "not a strong apply", "apply only if interested", "maybe", "consider", "neutral", or similar. Never return "Skip ❌" while saying the role is worth prioritizing. The recommendation is the final application decision.
- Do not over-credit generic backend experience for specialized roles such as iOS, Android, Salesforce, SAP, ServiceNow, Flowable, trading systems, embedded, quant, FPGA, healthcare legacy systems, or security clearance roles.
- strongMatches must be concise keywords only, with a maximum of 5 items. Good examples: "Python", "React", "REST APIs", "Docker", "PostgreSQL". Do not include evidence bullets or long phrases. Strong matches must be an intersection of resume evidence and JD requirements. Do not include a skill just because it appears in the JD. Do not infer unlisted tools from related experience. If the resume does not explicitly show Node.js, Vue.js, AWS, Kubernetes, or Ruby on Rails, do not list those as strong matches.
- Treat Authentication as a broader skill category when the JD asks for authentication, authorization, identity management, Microsoft Entra, Azure AD, B2C, Okta, Auth0, Cognito, Keycloak, SSO, OAuth, OIDC, or similar identity work and the resume shows concrete authentication implementation evidence such as JWT, authentication, authorization, RBAC, role-based access control, OAuth, OIDC, identity management, session management, SSO, secure login systems, or secure password hashing. Specific identity platforms should remain separate gaps if the resume lacks them.
- applicationRequirements must include only explicit extra application steps that affect whether the job seeker wants to spend time applying.
- Allowed applicationRequirements values are: "AI Interview Required", "Coding Challenge Required", "Take-Home Project Required", "Video Submission Required", "Portfolio Submission Required", "Multi-hour Assessment Required", "Work Sample Required", "Extra Platform Registration Required", and "Onsite Interview Required".
- Only add applicationRequirements when the JD explicitly states the requirement. For example, "Complete the API Rate Limiter Challenge and record a short video walkthrough" should return "Coding Challenge Required" and "Video Submission Required".
- Do not put skill, fit, seniority, years, platform, domain, technology, travel, work authorization, sponsorship, or security clearance requirements in applicationRequirements. Never include 4+ Years Required, Cloud Required, AI/LLM Required, Seniority Mismatch, Domain Experience Required, Must Have Existing Platform Experience, Travel Required, Security Clearance Required, US Work Authorization Required, or Sponsorship Not Available.
- effortLevel must reflect application time cost: Low = resume only / standard application; Medium = resume plus custom application questions or one light extra step; High = assessment, coding challenge, or take-home project; Very High = coding challenge plus video submission or multiple major extra steps.
- Company history such as "Built on a legacy of 40 years in the market" must not create any applicationRequirements.
- Critical gaps should emphasize only the biggest required or decision-changing missing requirements: core technology mismatch, primary responsibility mismatch, explicitly stated years mismatch, platform/domain mismatch, and specialized requirements. Do not list every secondary, nice-to-have, preferred, bonus, plus, familiarity, or exposure gap.
- Critical gaps must never invent hard requirements. Only include a gap when the JD explicitly states the requirement, such as "5+ years experience", "AWS required", or "US Citizenship required", or when the gap is directly implied by a clearly named required technology/domain such as Kubernetes, LangGraph, SAP, iOS/Swift, or Salesforce. Do not create inferred requirements like "3+ years experience required", "senior-level experience required", "lead-level communication skills required", or "professional experience beyond internship not demonstrated" unless the JD explicitly states that requirement. If uncertain, omit the gap.
- Ignore benefits, PTO, medical, dental, vision, 401k, compensation boilerplate, legal text, and generic company culture when determining fit.
- Keep shortReasoning to one concise recruiter-style paragraph.
`;

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(body, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown OpenAI error';
}

function getInterviewChanceUpperBound(interviewChance) {
  if (typeof interviewChance !== 'string' || interviewChance.length === 0) {
    return null;
  }

  const matches = [...interviewChance.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  if (matches.length === 0) {
    return interviewChance.includes('<') ? 1 : null;
  }

  return Math.max(...matches);
}

function getRecommendationRank(recommendation) {
  const ranks = {
    'Hard Skip ❌❌': 0,
    'Skip ❌': 1,
    'Apply ✅': 2,
    'Strong Apply ✅': 3,
  };

  return ranks[recommendation] ?? 0;
}

function capRecommendation(recommendation, cap) {
  if (!cap) {
    return recommendation;
  }

  return getRecommendationRank(recommendation) > getRecommendationRank(cap) ? cap : recommendation;
}

function downgradeRecommendation(recommendation) {
  if (recommendation === 'Strong Apply ✅') return 'Apply ✅';
  return recommendation;
}

function getStrongMatchCount(analysis) {
  return Array.isArray(analysis.strongMatches) ? analysis.strongMatches.length : 0;
}

function hasExtremeMismatchForHardSkip(analysis) {
  const criticalGaps = Array.isArray(analysis.criticalGaps) ? analysis.criticalGaps.join(' ') : '';

  return (
    analysis.educationGate === 'Severe Gap' ||
    (analysis.experienceGate === 'Severe Gap' && Number(analysis.requiredExperienceYears ?? 0) >= 8) ||
    analysis.levelGap === 'Severe' ||
    /\b(security clearance|active clearance|secret clearance|top secret|phd|ph\.?d|doctorate|embedded systems?|ios|swift|android|kotlin|golang|go\b|machine learning|ml\b|data scientist|data science)\b/i.test(
      criticalGaps,
    )
  );
}

function getWorkflowRecommendation(analysis) {
  const score = analysis.fitScore;
  const effortLevel = analysis.effortLevel ?? 'Low';
  const applicationRequirements = Array.isArray(analysis.applicationRequirements)
    ? analysis.applicationRequirements
    : [];
  const companyType = analysis.companyType ?? 'Unknown';
  const opportunityQuality = analysis.opportunityQuality ?? 'Medium';
  const interviewChanceUpperBound = getInterviewChanceUpperBound(analysis.interviewChance);
  const lowInterviewChance = interviewChanceUpperBound !== null && interviewChanceUpperBound <= 5;
  const veryLowInterviewChance = interviewChanceUpperBound !== null && interviewChanceUpperBound <= 1;
  const strongMatchCount = getStrongMatchCount(analysis);
  const veryHighEffort =
    applicationRequirements.includes('AI Interview Required') ||
    effortLevel === 'Very High' ||
    (applicationRequirements.includes('Coding Challenge Required') &&
      applicationRequirements.includes('Video Submission Required')) ||
    applicationRequirements.includes('Multi-hour Assessment Required');
  const highEffort = effortLevel === 'High' || veryHighEffort;
  const strongOpportunity = opportunityQuality === 'High';
  const weakerOpportunity = opportunityQuality === 'Low';
  const reasoningText = [
    analysis.shortReasoning,
    ...(Array.isArray(analysis.criticalGaps) ? analysis.criticalGaps : []),
  ].join(' ');
  const hasBlockingExperienceMismatch =
    /\b(?:major|severe) experience[- ]level mismatch\b/i.test(reasoningText) ||
    /\bsenior[- ]level mismatch\b/i.test(reasoningText);
  const applyPostingQualityAdjustment = (value) =>
    ['Talent Network', 'Suspicious Posting'].includes(companyType) ? downgradeRecommendation(value) : value;

  let recommendation;

  if (score <= 3.5 || hasBlockingExperienceMismatch) {
    recommendation = veryLowInterviewChance || hasExtremeMismatchForHardSkip(analysis)
      ? 'Hard Skip \u274c\u274c'
      : 'Skip \u274c';
    return capRecommendation(recommendation, analysis.recommendationCap);
  }

  if (score >= 8) {
    if (veryHighEffort && lowInterviewChance) {
      recommendation = 'Apply ✅';
      return capRecommendation(applyPostingQualityAdjustment(recommendation), analysis.recommendationCap);
    }

    if (weakerOpportunity) {
      recommendation = 'Apply ✅';
      return capRecommendation(applyPostingQualityAdjustment(recommendation), analysis.recommendationCap);
    }

    if (strongOpportunity) {
      recommendation = 'Strong Apply ✅';
      return capRecommendation(applyPostingQualityAdjustment(recommendation), analysis.recommendationCap);
    }

    recommendation = 'Apply ✅';
    return capRecommendation(applyPostingQualityAdjustment(recommendation), analysis.recommendationCap);
  }

  if (score >= 7) {
    if ((highEffort && lowInterviewChance) || weakerOpportunity) {
      recommendation = 'Apply ✅';
      return capRecommendation(applyPostingQualityAdjustment(recommendation), analysis.recommendationCap);
    }

    recommendation = 'Apply ✅';
    return capRecommendation(applyPostingQualityAdjustment(recommendation), analysis.recommendationCap);
  }

  if (score >= 6) {
    if ((effortLevel === 'Low' || effortLevel === 'Medium') && !veryLowInterviewChance) {
      recommendation = 'Apply ✅';
      return capRecommendation(applyPostingQualityAdjustment(recommendation), analysis.recommendationCap);
    }

    recommendation = 'Apply ✅';
    return capRecommendation(applyPostingQualityAdjustment(recommendation), analysis.recommendationCap);
  }

  if (score >= 4) {
    recommendation = 'Skip ❌';
    return capRecommendation(recommendation, analysis.recommendationCap);
  }

  if (veryLowInterviewChance || hasExtremeMismatchForHardSkip(analysis)) {
    recommendation = 'Hard Skip ❌❌';
    return capRecommendation(recommendation, analysis.recommendationCap);
  }

  recommendation = strongMatchCount >= 3 && !highEffort ? 'Apply ✅' : 'Skip ❌';
  return capRecommendation(applyPostingQualityAdjustment(recommendation), analysis.recommendationCap);
}

function getDecisionPrefix(recommendation) {
  if (recommendation === 'Strong Apply ✅') {
    return 'Strong Apply because the fit and opportunity quality make this worth prioritizing.';
  }

  if (recommendation === 'Apply ✅') {
    return 'Apply because the role is worthwhile, but the overall application value does not justify treating it as a top-priority strong apply.';
  }

  if (recommendation === 'Skip ❌') {
    return 'Skip because the expected return on application time is low.';
  }

  return 'Hard Skip because the mismatch is too large to justify applying.';
}

function hasContradictoryReasoning(analysis) {
  const reasoning = String(analysis.shortReasoning ?? '').toLowerCase();
  const recommendation = analysis.recommendation;

  if (!reasoning) {
    return true;
  }

  if (recommendation === 'Strong Apply ✅') {
    return [
      'not a strong apply',
      'not strong apply',
      'apply only if',
      'only if especially interested',
      'maybe',
      'consider',
      'neutral',
      'skip',
      'low expected return',
      'not worth',
    ].some((phrase) => reasoning.includes(phrase));
  }

  if (recommendation === 'Apply ✅') {
    return [
      'strong apply',
      'skip',
      'do not apply',
      'not worth',
      'only if especially interested',
    ].some((phrase) => reasoning.includes(phrase));
  }

  if (recommendation === 'Skip ❌' || recommendation === 'Hard Skip ❌❌') {
    return [
      'strong apply',
      'worth prioritizing',
      'apply normally',
      'good fit and worth applying',
      'excellent fit',
    ].some((phrase) => reasoning.includes(phrase));
  }

  return false;
}

function getReasoningDetails(analysis) {
  const details = [];
  const fitScore = typeof analysis.fitScore === 'number' ? analysis.fitScore.toFixed(1) : null;

  if (fitScore) {
    details.push(`Fit score is ${fitScore}/10`);
  }

  if (analysis.interviewChance) {
    details.push(`estimated interview chance is ${analysis.interviewChance}`);
  }

  if (analysis.companyType && analysis.opportunityQuality) {
    details.push(`the opportunity is ${analysis.opportunityQuality.toLowerCase()} quality from a ${analysis.companyType.toLowerCase()}`);
  }

  if (Array.isArray(analysis.applicationRequirements) && analysis.applicationRequirements.length > 0) {
    details.push(`extra application steps include ${analysis.applicationRequirements.join(', ')}`);
  }

  if (Array.isArray(analysis.criticalGaps) && analysis.criticalGaps.length > 0) {
    details.push(`main gaps include ${analysis.criticalGaps.slice(0, 2).join(', ')}`);
  }

  if (details.length === 0) {
    return '';
  }

  return ` ${details.join('; ')}.`;
}

function ensureOutputConsistency(analysis) {
  if (!analysis || typeof analysis !== 'object') {
    return analysis;
  }

  const consistentAnalysis = {
    ...analysis,
    recommendation: getWorkflowRecommendation(analysis),
  };

  if (!hasContradictoryReasoning(consistentAnalysis)) {
    return consistentAnalysis;
  }

  return {
    ...consistentAnalysis,
    shortReasoning: `${getDecisionPrefix(consistentAnalysis.recommendation)}${getReasoningDetails(consistentAnalysis)}`,
  };
}

function normalizeRecommendation(analysis) {
  if (typeof analysis?.fitScore !== 'number') {
    return analysis;
  }

  return ensureOutputConsistency(analysis);
}

async function analyzeWithOpenAI({ resumeText, jobDescriptionText }) {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is missing. Add it to .env and restart npm run dev.');
  }

  console.log(`Calling OpenAI model ${model}`);

  const response = await openai.responses.create({
    model,
    temperature: 0,
    input: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: JSON.stringify({
          resumeText,
          jobDescriptionText,
        }),
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'interview_chance_analysis',
        strict: true,
        schema: analysisSchema,
      },
    },
  });

  const outputText = response.output_text;
  if (!outputText) {
    throw new Error('OpenAI returned an empty analysis response.');
  }

  console.log('Raw OpenAI analysis JSON:', outputText);

  try {
    return JSON.parse(outputText);
  } catch {
    throw new Error('OpenAI returned analysis that was not valid JSON.');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  console.log(`${req.method ?? 'UNKNOWN'} ${url.pathname}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (url.pathname !== '/api/analyze') {
    sendJson(res, 404, { success: false, message: 'Not found' });
    return;
  }

  if (req.method === 'GET') {
    sendJson(res, 200, {
      success: true,
      message: 'API is working',
      model,
      openAIConfigured: Boolean(openai),
    });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { success: false, message: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    sendJson(res, 400, { success: false, message: 'Request body must be valid JSON' });
    return;
  }

  const resumeText = typeof body.resumeText === 'string' ? body.resumeText.trim() : '';
  const jobDescriptionText =
    typeof body.jobDescriptionText === 'string' ? body.jobDescriptionText.trim() : '';

  if (!resumeText || !jobDescriptionText) {
    sendJson(res, 400, {
      success: false,
      message: 'resumeText and jobDescriptionText are required.',
    });
    return;
  }

  try {
    const rawAnalysis = await analyzeWithOpenAI({ resumeText, jobDescriptionText });
    console.log(
      'OpenAI applicationRequirements before post-processing:',
      JSON.stringify(rawAnalysis.applicationRequirements ?? []),
    );

    const analysisWithApplicationRequirements = applyApplicationRequirements(rawAnalysis, jobDescriptionText);
    const employmentType = extractEmploymentType(jobDescriptionText);
    const analysisWithFilteredMatches = {
      ...analysisWithApplicationRequirements,
      employmentType: employmentType ?? undefined,
      strongMatches: normalizeStrongMatches(
        analysisWithApplicationRequirements.strongMatches,
        { resumeText, jobDescriptionText },
      ),
    };
    const normalizedAnalysis = normalizeRecommendation(
      applyAnalysisGuardrails(analysisWithFilteredMatches, { jobDescriptionText, resumeText }),
    );
    const analysis = applyFinalConsistencyRepair(normalizedAnalysis, {
      jobDescriptionText,
      resumeText,
    });
    console.log(
      'API applicationRequirements after post-processing:',
      JSON.stringify(analysis.applicationRequirements),
    );

    sendJson(res, 200, analysis);
  } catch (error) {
    console.error('OpenAI analysis failed:', error);
    sendJson(res, 502, {
      success: false,
      message: 'OpenAI analysis failed. Check your API key, model, network connection, and server logs.',
      error: getErrorMessage(error),
    });
  }
});

server.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
  console.log(`OpenAI model: ${model}`);
  console.log(`OpenAI configured: ${Boolean(openai)}`);
});
