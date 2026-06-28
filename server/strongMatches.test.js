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
    ['Authentication & Authorization'],
  );
});

test('keeps platform-specific identity systems separate from general authentication', () => {
  const resumeText = 'Implemented OAuth, OIDC, session management, and role-based access control.';
  const jobDescriptionText = 'Experience with Okta or Auth0 identity integrations preferred.';

  assert.deepEqual(
    normalizeStrongMatches(['Okta', 'Auth0'], { resumeText, jobDescriptionText }),
    ['Authentication & Authorization'],
  );
});

test('canonicalizes frontend keyword clusters into one React capability', () => {
  const resumeText = 'Built React, React Hooks, TypeScript, and JavaScript interfaces.';
  const jobDescriptionText = 'Frontend role requiring React, React.js, TypeScript, JavaScript, and React Hooks.';

  assert.deepEqual(
    normalizeStrongMatches(['React', 'JavaScript', 'TypeScript', 'React Hooks'], {
      resumeText,
      jobDescriptionText,
    }),
    ['React'],
  );
});

test('canonicalizes general SQL requests into SQL Databases', () => {
  const resumeText = 'Worked with SQL, PostgreSQL, SQL Server, and MySQL databases.';
  const jobDescriptionText = 'Backend role requiring SQL database experience.';

  assert.deepEqual(
    normalizeStrongMatches(['SQL', 'PostgreSQL', 'SQL Server'], {
      resumeText,
      jobDescriptionText,
    }),
    ['SQL Databases'],
  );
});

test('keeps explicitly requested database technology specific', () => {
  const resumeText = 'Built production services with PostgreSQL and SQL.';
  const jobDescriptionText = 'Backend role requiring PostgreSQL experience.';

  assert.deepEqual(
    normalizeStrongMatches(['SQL', 'PostgreSQL'], {
      resumeText,
      jobDescriptionText,
    }),
    ['PostgreSQL'],
  );
});

test('suppresses broad SQL Databases when PostgreSQL is already shown', () => {
  const resumeText = 'Built production services with PostgreSQL, SQL, Python, C#, and .NET.';
  const jobDescriptionText = 'Backend role requiring C#, Python, .NET, PostgreSQL, and SQL database experience.';

  const matches = normalizeStrongMatches(['C#', 'Python', '.NET', 'PostgreSQL', 'SQL Databases'], {
    resumeText,
    jobDescriptionText,
  });

  assert.ok(matches.includes('PostgreSQL'));
  assert.equal(matches.includes('SQL Databases'), false);
});

test('canonicalizes REST and authentication variants', () => {
  const resumeText = 'Built RESTful APIs with JWT authentication, authorization, and RBAC.';
  const jobDescriptionText = 'Role requires REST API development and authentication/authorization experience.';

  assert.deepEqual(
    normalizeStrongMatches(['REST', 'REST API Development', 'JWT', 'Authentication', 'Authorization'], {
      resumeText,
      jobDescriptionText,
    }),
    ['REST APIs', 'Authentication & Authorization'],
  );
});

test('ranks strong matches by engineering decision priority', () => {
  const resumeText = 'Python React REST APIs PostgreSQL Docker GitHub Actions Cursor GitHub Copilot.';
  const jobDescriptionText = 'Need Python, React, REST APIs, PostgreSQL, Docker, CI/CD, and AI coding tools.';

  assert.deepEqual(
    normalizeStrongMatches(['Docker', 'AI coding tools', 'PostgreSQL', 'REST APIs', 'React', 'Python'], {
      resumeText,
      jobDescriptionText,
    }),
    ['Python', 'React', 'REST APIs', 'PostgreSQL', 'Docker'],
  );
});
