import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('extension reuses existing app tab without navigating away from unsaved JD state', async () => {
  const popupSource = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

  assert.match(popupSource, /chrome\.tabs\.update\(existingTab\.id,\s*\{\s*active:\s*true\s*\}\)/);
  assert.doesNotMatch(popupSource, /chrome\.tabs\.update\(existingTab\.id,\s*\{[^}]*url:/s);
  assert.match(popupSource, /chrome\.tabs\.sendMessage\(/);
  assert.match(popupSource, /INTERVIEW_CHANCE_CHECKER_CONSUME_HANDOFF/);
});

test('extension still supports new-tab URL handoff when no app tab exists', async () => {
  const popupSource = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

  assert.match(popupSource, /function createAppUrl\(handoffId\)/);
  assert.match(popupSource, /chrome\.tabs\.create\(\{\s*url:\s*appUrl\s*\}\)/);
});

test('app bridge can consume handoffs from direct messages and URL fallback', async () => {
  const bridgeSource = await readFile(new URL('../extension/appBridge.js', import.meta.url), 'utf8');

  assert.match(bridgeSource, /chrome\.runtime\.onMessage\.addListener/);
  assert.match(bridgeSource, /INTERVIEW_CHANCE_CHECKER_CONSUME_HANDOFF/);
  assert.match(bridgeSource, /window\.postMessage/);
  assert.match(bridgeSource, /searchParams\.get\('handoffId'\)/);
  assert.match(bridgeSource, /chrome\.storage\.local\.remove\(handoffId\)/);
});
