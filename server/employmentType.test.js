import assert from 'node:assert/strict';
import test from 'node:test';
import { extractEmploymentType } from './employmentType.js';

test('detects explicit full-time employment type', () => {
  assert.equal(
    extractEmploymentType('This is a Full-Time Software Engineer role with benefits.'),
    'Full-Time',
  );
});

test('detects volunteer and unpaid employment types', () => {
  assert.equal(
    extractEmploymentType(`
      LinkedIn Job Posting
      Title: UNPAID VOLUNTEER - Front End Engineer
      Company: The City Tutors
      Employment Type: Volunteer

      Job Description:
      This is a remote volunteer role supporting education technology projects.
    `),
    'Volunteer (Unpaid)',
  );
  assert.equal(
    extractEmploymentType('Employment Type: Volunteer\nBuild frontend features for a nonprofit.'),
    'Volunteer',
  );
  assert.equal(
    extractEmploymentType('This is an unpaid internship for a frontend developer.'),
    'Unpaid',
  );
});

test('paid nonprofit and paid internship language do not trigger unpaid volunteer type', () => {
  assert.equal(
    extractEmploymentType('A nonprofit is hiring a paid full-time software engineer with benefits.'),
    'Full-Time',
  );
  assert.equal(
    extractEmploymentType('This is a paid internship position for summer software engineering work.'),
    'Internship',
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

test('LinkedIn full-time metadata overrides operational contract language', () => {
  assert.equal(
    extractEmploymentType(`
      Remote
      Full-time

      The period of performance for this contract expires in 2027.
      Responsibilities include delivery support and customer implementation work.
    `),
    'Full-Time',
  );
});

test('explicit employment or position type contract remains contract', () => {
  assert.equal(
    extractEmploymentType('Position Type: Contract'),
    'Contract',
  );
  assert.equal(
    extractEmploymentType('Employment Type: Contract'),
    'Contract',
  );
});

test('LinkedIn full-time metadata overrides government contract body references', () => {
  assert.equal(
    extractEmploymentType(`
      Remote
      Full-time

      Support government contract programs and contract lifecycle reporting.
    `),
    'Full-Time',
  );
});

test('business contract references alone are not employment type signals', () => {
  assert.equal(
    extractEmploymentType('Support government contract programs and customer contracts.'),
    null,
  );
  assert.equal(
    extractEmploymentType('The period of performance for this contract expires in 2027.'),
    null,
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
