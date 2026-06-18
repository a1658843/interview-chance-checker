type JsonResponse = {
  status: (statusCode: number) => JsonResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

type AnalyzeRequest = {
  method?: string;
  body?: unknown;
};

declare const process: {
  env: {
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
  };
};

const candidateProfileSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'estimatedExperienceYears',
    'seniorityLevel',
    'primaryRoleType',
    'strongestSkills',
    'domainExperience',
  ],
  properties: {
    estimatedExperienceYears: { type: 'number', minimum: 0 },
    seniorityLevel: {
      type: 'string',
      enum: ['student', 'new_grad', 'early_career', 'mid_level', 'senior', 'staff_plus'],
    },
    primaryRoleType: { type: 'string' },
    strongestSkills: { type: 'array', items: { type: 'string' } },
    domainExperience: { type: 'array', items: { type: 'string' } },
  },
};

const jobProfileSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'requiredExperienceYears',
    'roleType',
    'criticalRequirements',
    'specializedRequirements',
    'competitionSignals',
  ],
  properties: {
    requiredExperienceYears: { type: ['number', 'null'], minimum: 0 },
    roleType: { type: 'string' },
    criticalRequirements: { type: 'array', items: { type: 'string' } },
    specializedRequirements: { type: 'array', items: { type: 'string' } },
    competitionSignals: { type: 'array', items: { type: 'string' } },
  },
};

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'candidateProfile',
    'jobProfile',
    'jobFitScore',
    'recommendation',
    'estimatedInterviewChance',
    'marketCompetition',
    'strongMatches',
    'criticalGaps',
    'specializedGaps',
    'missingSkills',
    'missingSignals',
    'whyChanceIsNotHigher',
    'competitionFactors',
    'recruiterConcerns',
    'topImprovements',
    'reasoning',
  ],
  properties: {
    candidateProfile: candidateProfileSchema,
    jobProfile: jobProfileSchema,
    jobFitScore: { type: 'number', minimum: 0, maximum: 10 },
    recommendation: {
      type: 'string',
      enum: ['Strong Apply', 'Apply', 'Stretch', 'Skip'],
    },
    estimatedInterviewChance: { type: 'string' },
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
          evidence: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    criticalGaps: { type: 'array', items: { type: 'string' } },
    specializedGaps: { type: 'array', items: { type: 'string' } },
    missingSkills: { type: 'array', items: { type: 'string' } },
    missingSignals: { type: 'array', items: { type: 'string' } },
    whyChanceIsNotHigher: { type: 'array', items: { type: 'string' } },
    competitionFactors: { type: 'array', items: { type: 'string' } },
    recruiterConcerns: { type: 'array', items: { type: 'string' } },
    topImprovements: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
};

const systemPrompt = `
You are an expert software engineering recruiter and resume reviewer.

Analyze resume-to-job fit with this process:
1. Infer the candidate profile from the resume only.
2. Infer the job profile from the job description only.
3. Compare the candidate profile against the job profile.
4. Produce the exact JSON shape requested by the schema.

Rules:
- Job Fit Score is resume-to-JD fit only, from 0.0 to 10.0.
- Estimated Interview Chance is separate from fit score and accounts for remote status, Easy Apply, visible applicant count, days since posted, referrals/connections, seniority mismatch, years required, and company competitiveness.
- Use conservative interview chance ranges. A strong fit can still have a low chance when the role is remote, Easy Apply, and has 100+ applicants.
- Recommendation mapping: 8.0-10.0 Strong Apply, 6.0-7.9 Apply, 4.0-5.9 Stretch, 0.0-3.9 Skip. If score is under 6.0, recommendation must not be Apply.
- Infer years requirement relative to the actual resume. Do not cap a genuinely senior candidate just because a JD asks for 5+ years.
- Do not over-credit generic backend experience for specialized roles such as iOS, Android, Salesforce, SAP, ServiceNow, Flowable, trading systems, embedded systems, quant roles, security clearance, FPGA, or specialized healthcare/legacy systems.
- If a platform or specialized domain is central to the role and missing from the resume, the score should usually be low and Specialized Gaps should be explicit.
- Every Strong Match must include concrete evidence copied or tightly paraphrased from the resume. Do not invent evidence. Do not include unsupported strong matches.
- Missing Skills are technologies. Missing Signals are experience patterns.
- Ignore benefits, PTO, 401k, medical, dental, vision, stock, parental leave, stipends, legal text, and company culture boilerplate when determining fit.
- Keep reasoning concise, recruiter-like, and transparent.
`;

function parseBody(body: unknown) {
  if (typeof body === 'string') {
    return JSON.parse(body) as Record<string, unknown>;
  }

  if (body && typeof body === 'object') {
    return body as Record<string, unknown>;
  }

  return {};
}

function getOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === 'string') {
    return payload.output_text;
  }

  const output = payload.output;
  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== 'object') {
        continue;
      }

      const text = (contentItem as { text?: unknown }).text;
      if (typeof text === 'string') {
        return text;
      }
    }
  }

  return null;
}

export default async function handler(req: AnalyzeRequest, res: JsonResponse) {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = parseBody(req.body);
  } catch {
    res.status(400).json({ error: 'Request body must be valid JSON' });
    return;
  }

  const resumeText = typeof body.resumeText === 'string' ? body.resumeText.trim() : '';
  const jobDescriptionText =
    typeof body.jobDescriptionText === 'string' ? body.jobDescriptionText.trim() : '';

  if (!resumeText || !jobDescriptionText) {
    res.status(400).json({ error: 'resumeText and jobDescriptionText are required' });
    return;
  }

  const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemPrompt }],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({ resumeText, jobDescriptionText }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'interview_chance_analysis',
          strict: true,
          schema: responseSchema,
        },
      },
    }),
  });

  const payload = (await openAiResponse.json()) as Record<string, unknown>;

  if (!openAiResponse.ok) {
    res.status(openAiResponse.status).json({
      error: 'OpenAI analysis failed',
      details: payload,
    });
    return;
  }

  const outputText = getOutputText(payload);
  if (!outputText) {
    res.status(502).json({ error: 'OpenAI response did not include JSON output' });
    return;
  }

  try {
    res.status(200).json(JSON.parse(outputText));
  } catch {
    res.status(502).json({ error: 'OpenAI response was not valid JSON' });
  }
}
