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
      'Coding Challenge Required',
      '4+ Years Required',
      'Cloud Required',
      'AI/LLM Required',
      'Seniority Mismatch',
      'Must Have Existing Platform Experience',
    ]),
    ['Coding Challenge Required'],
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
  assert.equal(getEffortLevel(['Portfolio Required']), 'Medium');
  assert.equal(getEffortLevel(['Coding Challenge Required']), 'High');
  assert.equal(getEffortLevel(['Take-home Project Required']), 'High');
  assert.equal(getEffortLevel(['Coding Challenge Required', 'Video Submission Required']), 'Very High');
  assert.equal(getEffortLevel(['Multi-hour Assessment Required']), 'Very High');
});
