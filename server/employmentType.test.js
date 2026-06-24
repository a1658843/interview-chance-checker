import assert from 'node:assert/strict';
import test from 'node:test';
import { extractEmploymentType } from './employmentType.js';

test('detects explicit full-time employment type', () => {
  assert.equal(
    extractEmploymentType('This is a Full-Time Software Engineer role with benefits.'),
    'Full-Time',
  );
});

test('detects explicit contract employment type', () => {
  assert.equal(
    extractEmploymentType('Type: Contract'),
    'Contract',
  );
  assert.equal(
    extractEmploymentType('We are hiring a W2 contract software developer for a six month engagement.'),
    'Contract',
  );
  assert.equal(
    extractEmploymentType('This is a contract role supporting backend services.'),
    'Contract',
  );
  assert.equal(
    extractEmploymentType('12-month contract for a platform engineer.'),
    'Contract',
  );
});

test('detects combined part-time or full-time contract employment type', () => {
  assert.equal(
    extractEmploymentType('LinkedIn header: Part-time\nType: Contract'),
    'Part-Time Contract',
  );
  assert.equal(
    extractEmploymentType('This is a full-time role.\nType: Contract'),
    'Full-Time Contract',
  );
});

test('detects contract-to-hire before generic contract', () => {
  assert.equal(
    extractEmploymentType('Contract-to-hire backend engineer role.'),
    'Contract-to-Hire',
  );
  assert.equal(
    extractEmploymentType('This is a contract-to-hire role with potential full-time conversion.'),
    'Contract-to-Hire',
  );
});

test('omits employment type when signals are tied or absent', () => {
  assert.equal(
    extractEmploymentType('Full-time or part-time schedule available depending on team needs.'),
    null,
  );
  assert.equal(
    extractEmploymentType('Build backend systems for a growing product team.'),
    null,
  );
});
