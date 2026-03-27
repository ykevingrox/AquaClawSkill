#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseOptions, runHostedOnboard } from '../scripts/aqua-hosted-onboard.mjs';

function buildOptions(argv = []) {
  return parseOptions([
    '--hub-url',
    'https://aqua.example.com',
    '--invite-code',
    'invite-123',
    '--workspace-root',
    '/tmp/workspace',
    ...argv,
  ]);
}

test('parseOptions accepts the skip-intro flag', () => {
  const options = buildOptions(['--skip-intro']);
  assert.equal(options.enableIntro, false);
});

test('runHostedOnboard runs the intro step by default and passes authoring-related args through', async () => {
  const calls = [];
  const options = buildOptions([
    '--config-path',
    '/tmp/workspace/.aquaclaw/profiles/hosted-aqua-example-com/hosted-bridge.json',
    '--hosted-pulse-author-agent',
    'community',
    '--openclaw-bin',
    '/tmp/bin/openclaw',
  ]);

  const result = await runHostedOnboard(options, {
    scriptDir: '/tmp/scripts',
    runStepFn: (title, command, args) => {
      calls.push({ title, command, args });
      return 0;
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.introFailed, false);
  assert.equal(
    calls.map((entry) => entry.title).join(' | '),
    'Hosted Aqua Join | Live Context Verification | Heartbeat Cron | Hosted Pulse Service | First Sea Introduction',
  );

  const introCall = calls.find((entry) => entry.title === 'First Sea Introduction');
  assert.ok(introCall);
  assert.equal(introCall.command, '/tmp/scripts/aqua-hosted-intro.sh');
  assert.deepEqual(introCall.args, [
    '--format',
    'markdown',
    '--workspace-root',
    '/tmp/workspace',
    '--config-path',
    '/tmp/workspace/.aquaclaw/profiles/hosted-aqua-example-com/hosted-bridge.json',
    '--author-agent',
    'community',
    '--openclaw-bin',
    '/tmp/bin/openclaw',
  ]);
});

test('runHostedOnboard does not fail the whole onboarding when the intro step needs a retry', async () => {
  const options = buildOptions();

  const result = await runHostedOnboard(options, {
    scriptDir: '/tmp/scripts',
    runStepFn: (title) => (title === 'First Sea Introduction' ? 1 : 0),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.introFailed, true);
  assert.equal(result.contextFailed, false);
});

test('runHostedOnboard skips the intro step entirely when requested', async () => {
  const calls = [];
  const options = buildOptions(['--skip-intro']);

  const result = await runHostedOnboard(options, {
    scriptDir: '/tmp/scripts',
    runStepFn: (title, command, args) => {
      calls.push({ title, command, args });
      return 0;
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(calls.some((entry) => entry.title === 'First Sea Introduction'), false);
});
