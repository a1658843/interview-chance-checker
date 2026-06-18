import 'dotenv/config';
import http from 'node:http';
import OpenAI from 'openai';

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
    'strongMatches',
    'specialFlags',
    'criticalGaps',
    'recruiterConcerns',
    'shortReasoning',
  ],
  properties: {
    fitScore: {
      type: 'number',
      minimum: 0,
      maximum: 10,
      description:
        'Resume-to-job fit score from 0.0 to 10.0, heavily penalizing missing core technology, platform, domain, or seniority requirements.',
    },
    recommendation: {
      type: 'string',
      enum: ['Strong Apply', 'Apply', 'Stretch', 'Skip'],
    },
    interviewChance: {
      type: 'string',
      description: 'Conservative real-world interview chance range, such as 3-8%.',
    },
    marketCompetition: {
      type: 'string',
      enum: ['Low', 'Medium', 'High', 'Very High'],
    },
    strongMatches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'evidence'],
        properties: {
          label: { type: 'string' },
          evidence: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
    specialFlags: {
      type: 'array',
      description:
        'Concise recruiter-focused flags for unusual application requirements or material apply/no-apply constraints.',
      items: {
        type: 'string',
        enum: [
          'Coding Challenge Required',
          'Take-Home Assignment',
          'Video Submission Required',
          'Portfolio Required',
          'Security Clearance Required',
          'US Citizen Required',
          'Green Card Required',
          'Relocation Required',
          'Onsite Interview Required',
          'Travel Required',
          'On-Call Rotation',
          'Contract Position',
          'Commission-Based Compensation',
          'Sponsorship Not Available',
          'Hybrid Role',
          'Fully Onsite',
          'Seniority Mismatch',
          'Domain-Specific Experience Required',
          'Must Have Existing Experience With Specific Platform',
          'Must Have Existing BPM Platform Experience',
        ],
      },
    },
    criticalGaps: {
      type: 'array',
      items: { type: 'string' },
    },
    recruiterConcerns: {
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
- fitScore measures resume-to-job-description fit only, from 0.0 to 10.0.
- Heavily penalize seniority mismatch. Generic technical overlap must not lift the score above the correct band when required years or seniority are missing.
- Score 0.0-2.0 when core technology, platform, domain, or seniority requirements are missing. Examples: JD requires 10+ years and candidate has less than 3 years; JD requires iOS and candidate has no iOS experience; JD requires Flowable or Camunda and candidate has none.
- Score 3.0-4.0 when there is partial technical overlap but major required experience is missing.
- Score 5.0-6.0 when there is reasonable overlap with some important gaps.
- Score 7.0-8.0 when there is strong overlap across role type, skills, and experience level.
- Score 9.0-10.0 only for a direct match across skills, experience level, seniority, and domain.
- recommendation must follow: 8.0-10.0 Strong Apply, 6.0-7.9 Apply, 4.0-5.9 Stretch, 0.0-3.9 Skip. If fitScore is under 6.0, recommendation must not be Apply.
- interviewChance is separate from fitScore. Estimate real-world interview odds using market factors like remote status, Easy Apply, applicant count, days since posted, required years, seniority mismatch, referrals/connections, and company competitiveness.
- Keep interviewChance conservative. A strong fit can still be 2-6% or 3-8% if competition is very high.
- Do not over-credit generic backend experience for specialized roles such as iOS, Android, Salesforce, SAP, ServiceNow, Flowable, trading systems, embedded, quant, FPGA, healthcare legacy systems, or security clearance roles.
- Every strong match must include concrete evidence from the resume. Do not invent evidence.
- Critical gaps should emphasize missing core requirements, years mismatch, platform/domain mismatch, and specialized requirements.
- specialFlags should identify unusual application requirements or material constraints that affect whether the candidate should apply, even when technical fit is good.
- Add specialFlags for coding challenges, take-home assignments, video walkthrough/submission requirements, portfolio requirements, security clearance, citizenship or green card requirements, relocation, onsite interviews, travel, on-call rotation, contract work, commission-based compensation, sponsorship not available, hybrid or fully onsite roles, seniority mismatch, domain-specific experience requirements, and must-have existing experience with specific platforms.
- If the JD mentions Flowable, Camunda, Activiti, BPMN, DMN, or workflow orchestration as required and the resume lacks it, include "Must Have Existing BPM Platform Experience".
- If the JD requires a niche platform such as Salesforce, ServiceNow, SAP, Workday, Edifecs, iOS, Android, React Native, Flutter, FPGA, embedded C, or a similar named platform and the resume lacks it, include "Must Have Existing Experience With Specific Platform".
- If the JD requires 5+ years, 8+ years, 10+ years, or 15+ years and the resume appears substantially below that level, include "Seniority Mismatch".
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

async function analyzeWithOpenAI({ resumeText, jobDescriptionText }) {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is missing. Add it to .env and restart npm run dev.');
  }

  console.log(`Calling OpenAI model ${model}`);

  const response = await openai.responses.create({
    model,
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
    const analysis = await analyzeWithOpenAI({ resumeText, jobDescriptionText });
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
