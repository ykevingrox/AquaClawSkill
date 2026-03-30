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

test('parseOptions accepts the no-self-heal flag', () => {
  const options = buildOptions(['--no-self-heal']);
  assert.equal(options.enableSelfHeal, false);
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
  assert.deepEqual(result.repairAttempts, []);
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
  assert.deepEqual(result.repairAttempts, []);
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
  assert.deepEqual(result.repairAttempts, []);
});

test('runHostedOnboard retries heartbeat once after a bounded self-heal pass', async () => {
  const options = buildOptions();
  let heartbeatAttempts = 0;
  const repairCalls = [];

  const result = await runHostedOnboard(options, {
    scriptDir: '/tmp/scripts',
    runStepFn: async (title) => {
      if (title === 'Heartbeat Cron') {
        heartbeatAttempts += 1;
        if (heartbeatAttempts === 1) {
          return {
            status: 1,
            stderr: 'GatewayClientRequestError: invalid cron.add params',
          };
        }
      }
      return { status: 0 };
    },
    planSelfHealFn: ({ title, stderr }) => {
      if (title === 'Heartbeat Cron' && stderr.includes('GatewayClientRequestError')) {
        return {
          reason: 'openclaw_runtime',
          actions: ['normalize_skill_scripts', 'ensure_hosted_state', 'repair_openclaw_runtime'],
        };
      }
      return null;
    },
    runSelfHealFn: async (plan, context) => {
      repairCalls.push({ plan, context });
      return { ok: true, summary: 'completed 3 self-heal action(s)' };
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(heartbeatAttempts, 2);
  assert.equal(repairCalls.length, 1);
  assert.equal(repairCalls[0].context.skillRoot, '/tmp');
  assert.equal(result.repairAttempts.length, 1);
  assert.equal(result.repairAttempts[0].title, 'Heartbeat Cron');
  assert.equal(result.repairAttempts[0].ok, true);
});

test('runHostedOnboard does not self-heal when disabled explicitly', async () => {
  const options = buildOptions(['--no-self-heal']);
  let heartbeatAttempts = 0;

  const result = await runHostedOnboard(options, {
    scriptDir: '/tmp/scripts',
    runStepFn: async (title) => {
      if (title === 'Heartbeat Cron') {
        heartbeatAttempts += 1;
        return {
          status: 1,
          stderr: 'GatewayClientRequestError: invalid cron.add params',
        };
      }
      return { status: 0 };
    },
    runSelfHealFn: async () => {
      throw new Error('self-heal should not run');
    },
  });

  assert.equal(result.exitCode, 1);
  assert.equal(heartbeatAttempts, 1);
  assert.deepEqual(result.repairAttempts, []);
});
