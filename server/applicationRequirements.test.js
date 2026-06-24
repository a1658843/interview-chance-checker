import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyApplicationRequirements,
  extractApplicationRequirements,
  getEffortLevel,
  normalizeApplicationRequirements,
} from './applicationRequirements.js';

test('Provn-style challenge and video walkthrough are detected', () => {
  const jd = 'Complete the API Rate Limiter Challenge and record a short video walkthrough.';

  assert.deepEqual(extractApplicationRequirements(jd), [
    'Coding Challenge Required',
    'Video Submission Required',
  ]);
});

test('AI interview is detected as a high-impact application step', () => {
  const jd = 'Applicants must complete an AI interview before recruiter review.';

  assert.deepEqual(extractApplicationRequirements(jd), ['AI Interview Required']);
});

test('AI interview based on resume is detected even with platform registration', () => {
  const jd = 'Application Process: Upload resume, AI interview based on your resume, submit form.';
  const result = applyApplicationRequirements(
    {
      fitScore: 7.5,
      applicationRequirements: ['Extra Platform Registration Required'],
    },
    jd,
  );

  assert.deepEqual(extractApplicationRequirements(jd), ['AI Interview Required']);
  assert.deepEqual(result.applicationRequirements, [
    'Extra Platform Registration Required',
    'AI Interview Required',
  ]);
  assert.equal(result.effortLevel, 'Very High');
});

test('AI interview phrase variants are detected', () => {
  assert.deepEqual(extractApplicationRequirements('Complete your AI screening interview.'), [
    'AI Interview Required',
  ]);
  assert.deepEqual(extractApplicationRequirements('The first step is a chatbot interview.'), [
    'AI Interview Required',
  ]);
  assert.deepEqual(extractApplicationRequirements('Applicants complete a recorded AI interview.'), [
    'AI Interview Required',
  ]);
  assert.deepEqual(extractApplicationRequirements('This includes an interview based on your resume.'), [
    'AI Interview Required',
  ]);
});

test('Kontent-style occasional customer travel is not an extra application step', () => {
  const jd = 'Travel occasionally to meet customers in person across North America.';

  assert.deepEqual(extractApplicationRequirements(jd), []);
});

test('isolved company history creates no application requirements', () => {
  const jd = 'Built on a legacy of 40 years in the market.';

  assert.deepEqual(extractApplicationRequirements(jd), []);
});

test('skill and fit flags are rejected from model output', () => {
  assert.deepEqual(
    normalizeApplicationRequirements([
      'AI Interview Required',
      'Coding Challenge Required',
      'Take-home Project Required',
      'Portfolio Required',
      '4+ Years Required',
      'Cloud Required',
      'AI/LLM Required',
      'Seniority Mismatch',
      'Must Have Existing Platform Experience',
    ]),
    [
      'AI Interview Required',
      'Coding Challenge Required',
      'Take-Home Project Required',
      'Portfolio Submission Required',
    ],
  );
});

test('model requirements are merged with deterministic requirements', () => {
  const result = applyApplicationRequirements(
    {
      fitScore: 6.2,
      applicationRequirements: ['Video Submission Required', 'Cloud Required'],
    },
    'Complete the API Rate Limiter Challenge.',
  );

  assert.deepEqual(result.applicationRequirements, [
    'Video Submission Required',
    'Coding Challenge Required',
  ]);
  assert.equal(result.effortLevel, 'Very High');
});

test('effort level follows application step cost', () => {
  assert.equal(getEffortLevel([]), 'Low');
  assert.equal(getEffortLevel(['Portfolio Submission Required']), 'Medium');
  assert.equal(getEffortLevel(['Coding Challenge Required']), 'High');
  assert.equal(getEffortLevel(['Take-Home Project Required']), 'High');
  assert.equal(getEffortLevel(['AI Interview Required']), 'Very High');
  assert.equal(getEffortLevel(['Coding Challenge Required', 'Video Submission Required']), 'Very High');
  assert.equal(getEffortLevel(['Multi-hour Assessment Required']), 'Very High');
});
