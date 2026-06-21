import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterStrongMatchesByResume,
  isStrongMatchSupportedByResume,
  normalizeStrongMatches,
} from './strongMatches.js';

test('removes JD-only frontend/backend skills from strong matches', () => {
  const resumeText = 'Skills: React, TypeScript, JavaScript, REST APIs, Python, PostgreSQL';

  assert.deepEqual(
    filterStrongMatchesByResume(['React', 'TypeScript', 'Node.js', 'Vue.js', 'AWS'], resumeText),
    ['React', 'TypeScript'],
  );
});

test('allows direct equivalents that are clearly supported by the resume', () => {
  const resumeText = 'Built ASP.NET Core MVC apps with Entity Framework Core and SQL Server.';

  assert.equal(isStrongMatchSupportedByResume('.NET', resumeText), true);
  assert.equal(isStrongMatchSupportedByResume('Entity Framework', resumeText), true);
  assert.equal(isStrongMatchSupportedByResume('SQL', resumeText), true);
});

test('allows AI coding tools only when supported by specific resume evidence', () => {
  const resumeText = 'Used Cursor and GitHub Copilot to speed up implementation.';

  assert.deepEqual(filterStrongMatchesByResume(['AI coding tools', 'Node.js'], resumeText), [
    'AI coding tools',
  ]);
});

test('does not infer Node.js from JavaScript or API experience', () => {
  const resumeText = 'Built JavaScript and REST API features with React and FastAPI.';

  assert.equal(isStrongMatchSupportedByResume('Node.js', resumeText), false);
  assert.equal(isStrongMatchSupportedByResume('REST APIs', resumeText), true);
});

test('supports Authentication from concrete auth implementation evidence', () => {
  const resumeText = 'Implemented JWT authentication, authorization, RBAC, and secure password hashing.';

  assert.equal(isStrongMatchSupportedByResume('Authentication', resumeText), true);
});

test('adds Authentication when JD asks for identity platforms and resume has general auth evidence', () => {
  const resumeText = 'Implemented JWT authentication, authorization, RBAC, and secure password hashing.';
  const jobDescriptionText =
    'Authentication experience required, authorization integrations, identity management, Microsoft Entra / Azure AD / B2C preferred.';

  assert.deepEqual(
    normalizeStrongMatches([], { resumeText, jobDescriptionText }),
    ['Authentication'],
  );
});

test('keeps platform-specific identity systems separate from general authentication', () => {
  const resumeText = 'Implemented OAuth, OIDC, session management, and role-based access control.';
  const jobDescriptionText = 'Experience with Okta or Auth0 identity integrations preferred.';

  assert.deepEqual(
    normalizeStrongMatches(['Okta', 'Auth0'], { resumeText, jobDescriptionText }),
    ['Authentication'],
  );
});
