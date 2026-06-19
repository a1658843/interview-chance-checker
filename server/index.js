import 'dotenv/config';
import http from 'node:http';
import OpenAI from 'openai';
import {
  allowedApplicationRequirements,
  applyApplicationRequirements,
  effortLevels,
} from './applicationRequirements.js';

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
        "Kevin's application-worthiness score from 0.0 to 10.0: whether he should realistically spend time applying, not strict ATS keyword fit.",
    },
    recommendation: {
      type: 'string',
      enum: ['Strong Apply ✅', 'Apply ✅', 'Borderline ⚠️', 'Skip ❌', 'Hard Skip ❌❌'],
    },
    interviewChance: {
      type: 'string',
      description: 'Conservative real-world interview chance range, such as 3-8%.',
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
- This app is not an ATS keyword checker and is not deciding whether the company should hire Kevin.
- The core question is: should Kevin realistically spend time applying to this job?
- fitScore should measure Kevin's fit for the role. Final recommendation should additionally account for application effort and expected interview return per hour spent.
- Always evaluate the actual resume against the actual job description. Never hardcode a score or recommendation from the job title, company, category, or example name alone.
- Treat a role as a hard blocker only when the JD requires core experience and Kevin's resume lacks that core experience. If Kevin has strong evidence for the core platform/language/domain, score it as a potential fit even if the role category is specialized.
- Do not treat every missing JD requirement equally. Distinguish hard blockers from learnable gaps.
- Hard blockers should heavily reduce fitScore: iOS role with no Swift/iOS experience; Android role with no Android/Kotlin experience; Flowable/Camunda/BPM role with no BPM experience; Edifecs/EDI role with no EDI experience; Java-only role with no Java experience; 10+ or 15+ years required when Kevin has less than 2 years; security clearance required and Kevin lacks it; fully onsite or relocation required when Kevin needs remote.
- Learnable gaps should reduce fitScore moderately, not catastrophically: healthcare domain, HIPAA, cloud platform, GraphQL, some AI/LLM application experience, 3+ years required when Kevin has around 1-2 years and otherwise matches the core stack, and preferred domain experience.
- Score 9.0-10.0 for excellent fits worth extra application effort such as coding challenge, take-home, video submission, networking, or custom materials.
- Score 7.0-8.9 for good fits worth a normal application, even if there are learnable gaps.
- Score 6.0-6.9 for borderline roles with meaningful gaps where Kevin should apply only if especially interested.
- Score 4.0-5.9 for low expected return on application time.
- Score 0.0-3.9 for major mismatch where Kevin should not spend time applying.
- recommendation must optimize for interview return per hour spent, using both fitScore and effortLevel. Fit 4.0-5.9 should usually be "Skip ❌", especially with high effort. Fit 6.0-6.9 with Low effort can be "Apply ✅", but with Very High effort should usually be "Borderline ⚠️". Fit 8.0+ should usually be "Strong Apply ✅" even with Very High effort.
- The following examples are illustrative calibration anchors only. Do not hardcode decisions from these names or categories; always re-evaluate the actual resume and JD.
- Curana-like calibration: Python backend + Software Engineer II + remote + AI application role, but missing healthcare, LLM depth, and 3+ years, should usually score around 7.0-8.0 and recommend Apply because it is plausibly worth Kevin applying.
- iOS calibration: Swift/iOS required and Kevin has none should score around 0.5-2.0 and recommend Hard Skip; Swift/iOS required and Kevin has strong Swift/iOS evidence may be Apply or Strong Apply.
- EDI/Edifecs calibration: Java + Edifecs + EDI X12 + payer domain required and Kevin has none should score around 1.0-3.0 and recommend Hard Skip; strong evidence in those requirements should raise the score.
- AHEAD-like calibration: 4+ years, AI/LLM integration, AWS/cloud, GraphQL; Kevin matches Python/React/API but lacks seniority and AI/cloud depth, should usually score around 5.5-6.5 and recommend Skip or Borderline depending on wording.
- PHP/Laravel challenge calibration: PHP/Laravel plus coding challenge/video; Kevin has a builder profile but lacks PHP/Laravel and may not want to spend time on the challenge, should usually score around 4.0-6.0 and recommend Skip unless fit is otherwise very high.
- interviewChance is separate from fitScore. Estimate real-world interview odds using market factors like remote status, Easy Apply, applicant count, days since posted, required years, seniority mismatch, referrals/connections, and company competitiveness.
- Keep interviewChance conservative. A strong fit can still be 2-6% or 3-8% if competition is very high.
- jobLogistics must summarize only concrete facts from the JD: Remote/Hybrid/Onsite, Full-time/Contract/Internship, Easy Apply/External Apply/Challenge-based, and Travel if present. Use a compact format like "Remote · Full-time · Easy Apply". Do not include vague labels such as posting pressure, competition, or applicant pressure. If a fact is not stated, omit that part. If no logistics are stated, use "Not specified".
- Do not over-credit generic backend experience for specialized roles such as iOS, Android, Salesforce, SAP, ServiceNow, Flowable, trading systems, embedded, quant, FPGA, healthcare legacy systems, or security clearance roles.
- strongMatches must be concise keywords only, with a maximum of 5 items. Good examples: "Python", "React", "REST APIs", "Docker", "PostgreSQL". Do not include evidence bullets or long phrases.
- applicationRequirements must include only explicit extra application steps that affect whether Kevin wants to spend time applying.
- Allowed applicationRequirements values are: "Coding Challenge Required", "Take-home Project Required", "Video Submission Required", "Portfolio Required", "Multi-hour Assessment Required", "Work Sample Required", "Extra Platform Registration Required", and "Onsite Interview Required".
- Only add applicationRequirements when the JD explicitly states the requirement. For example, "Complete the API Rate Limiter Challenge and record a short video walkthrough" should return "Coding Challenge Required" and "Video Submission Required".
- Do not put skill, fit, seniority, years, platform, domain, technology, travel, work authorization, sponsorship, or security clearance requirements in applicationRequirements. Never include 4+ Years Required, Cloud Required, AI/LLM Required, Seniority Mismatch, Domain Experience Required, Must Have Existing Platform Experience, Travel Required, Security Clearance Required, US Work Authorization Required, or Sponsorship Not Available.
- effortLevel must reflect application time cost: Low = resume only / standard application; Medium = resume plus custom application questions or one light extra step; High = assessment, coding challenge, or take-home project; Very High = coding challenge plus video submission or multiple major extra steps.
- Company history such as "Built on a legacy of 40 years in the market" must not create any applicationRequirements.
- Critical gaps should emphasize missing requirements over matched requirements: core requirements, years mismatch, platform/domain mismatch, and specialized requirements.
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

function getWorkflowRecommendation(score, effortLevel = 'Low') {
  if (score >= 8) {
    return 'Strong Apply ✅';
  }

  if (score >= 7) {
    if (effortLevel === 'High' || effortLevel === 'Very High') {
      return 'Borderline ⚠️';
    }

    return 'Apply ✅';
  }

  if (score >= 6) {
    if (effortLevel === 'Low') {
      return 'Apply ✅';
    }

    return 'Borderline ⚠️';
  }

  if (score >= 4) {
    return 'Skip ❌';
  }

  return 'Hard Skip ❌❌';
}

function normalizeRecommendation(analysis) {
  if (typeof analysis?.fitScore !== 'number') {
    return analysis;
  }

  return {
    ...analysis,
    recommendation: getWorkflowRecommendation(analysis.fitScore, analysis.effortLevel),
  };
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

    const analysis = normalizeRecommendation(applyApplicationRequirements(rawAnalysis, jobDescriptionText));
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
