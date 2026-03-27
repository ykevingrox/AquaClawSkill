#!/usr/bin/env node

import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';

import { parseOptions, runHostedIntro } from '../scripts/aqua-hosted-intro.mjs';
import { resolveHostedProfilePaths } from '../scripts/hosted-aqua-common.mjs';

function buildLoadedConfig(workspaceRoot, overrides = {}) {
  const profileId = overrides.profileId ?? 'hosted-aqua-example-com';
  const profilePaths = resolveHostedProfilePaths({
    workspaceRoot,
    profileId,
  });

  return {
    workspaceRoot,
    configPath: profilePaths.configPath,
    profileId,
    config: {
      hubUrl: overrides.hubUrl ?? 'https://aqua.example.com',
      credential: {
        token: 'gateway-secret',
      },
      gateway: {
        id: overrides.gatewayId ?? 'gw_alpha',
        handle: overrides.handle ?? 'alpha-claw',
        displayName: overrides.displayName ?? 'Alpha Claw',
      },
    },
  };
}

test('parseOptions resolves the profile-scoped intro state path', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-hosted-intro-parse-'));
  try {
    const profilePaths = resolveHostedProfilePaths({
      workspaceRoot,
      profileId: 'hosted-aqua-example-com',
    });
    const options = parseOptions([
      '--workspace-root',
      workspaceRoot,
      '--config-path',
      profilePaths.configPath,
    ]);

    assert.equal(options.stateFile, profilePaths.introStatePath);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('runHostedIntro skips without remote reads when the current gateway already has recorded intro state', async () => {
  let requestCount = 0;
  let authorCount = 0;

  const summary = await runHostedIntro(
    {
      workspaceRoot: '/tmp/workspace',
      configPath: '/tmp/workspace/.aquaclaw/profiles/hosted-aqua-example-com/hosted-bridge.json',
      stateFile: '/tmp/workspace/.aquaclaw/profiles/hosted-aqua-example-com/hosted-intro-state.json',
      authorAgent: 'auto',
      dryRun: false,
      force: false,
      openclawBin: null,
      tone: 'calm',
    },
    {
      loadHostedConfigFn: async () => buildLoadedConfig('/tmp/workspace'),
      readStateFn: async () => ({
        version: 1,
        gatewayId: 'gw_alpha',
        state: 'published',
      }),
      requestJsonFn: async () => {
        requestCount += 1;
        throw new Error('requestJson should not be called');
      },
      authorPublicExpressionFn: async () => {
        authorCount += 1;
        throw new Error('author should not be called');
      },
      saveStateFn: async () => {
        throw new Error('saveState should not be called');
      },
    },
  );

  assert.equal(summary.action, 'skipped');
  assert.equal(summary.reason, 'already_recorded');
  assert.equal(requestCount, 0);
  assert.equal(authorCount, 0);
});

test('runHostedIntro records remote existing public speech and skips a duplicate intro', async () => {
  const savedStates = [];

  const summary = await runHostedIntro(
    {
      workspaceRoot: '/tmp/workspace',
      configPath: '/tmp/workspace/.aquaclaw/profiles/hosted-aqua-example-com/hosted-bridge.json',
      stateFile: '/tmp/workspace/.aquaclaw/profiles/hosted-aqua-example-com/hosted-intro-state.json',
      authorAgent: 'auto',
      dryRun: false,
      force: false,
      openclawBin: null,
      tone: 'calm',
    },
    {
      loadHostedConfigFn: async () => buildLoadedConfig('/tmp/workspace'),
      readStateFn: async () => null,
      requestJsonFn: async (_hubUrl, pathname) => {
        assert.match(pathname, /\/api\/v1\/public-expressions\?/);
        return {
          data: {
            items: [
              {
                id: 'expr_existing',
                createdAt: '2026-03-27T01:00:00.000Z',
                tone: 'reflective',
                body: 'I have already surfaced here.',
              },
            ],
          },
        };
      },
      authorPublicExpressionFn: async () => {
        throw new Error('author should not be called when remote speech already exists');
      },
      saveStateFn: async (_stateFile, payload) => {
        savedStates.push(payload);
      },
    },
  );

  assert.equal(summary.action, 'skipped');
  assert.equal(summary.reason, 'remote_public_expression_exists');
  assert.equal(summary.existingExpression?.id, 'expr_existing');
  assert.equal(savedStates.length, 1);
  assert.equal(savedStates[0].state, 'remote_existing');
  assert.equal(savedStates[0].gatewayId, 'gw_alpha');
});

test('runHostedIntro publishes a first intro when the current gateway has no prior speech', async () => {
  const postedPayloads = [];
  const savedStates = [];
  const authorCalls = [];

  const summary = await runHostedIntro(
    {
      workspaceRoot: '/tmp/workspace',
      configPath: '/tmp/workspace/.aquaclaw/profiles/hosted-aqua-example-com/hosted-bridge.json',
      stateFile: '/tmp/workspace/.aquaclaw/profiles/hosted-aqua-example-com/hosted-intro-state.json',
      authorAgent: 'community',
      dryRun: false,
      force: false,
      openclawBin: null,
      tone: 'calm',
    },
    {
      loadHostedConfigFn: async () => buildLoadedConfig('/tmp/workspace'),
      readStateFn: async () => null,
      requestJsonFn: async (_hubUrl, pathname, request = {}) => {
        if (pathname.startsWith('/api/v1/public-expressions?')) {
          return { data: { items: [] } };
        }
        if (pathname === '/api/v1/currents/current') {
          return {
            data: {
              current: {
                label: 'Glasswater',
                tone: 'calm',
                summary: 'A slow, readable tide.',
              },
            },
          };
        }
        if (pathname === '/api/v1/environment/current') {
          return {
            data: {
              environment: {
                summary: 'Quiet water with a clear surface.',
              },
            },
          };
        }
        if (pathname === '/api/v1/public-expressions' && request.method === 'POST') {
          postedPayloads.push(request.payload);
          return {
            data: {
              expression: {
                id: 'expr_new_intro',
                createdAt: '2026-03-27T02:00:00.000Z',
                tone: 'calm',
                body: request.payload.body,
              },
            },
          };
        }
        throw new Error(`unexpected pathname: ${pathname}`);
      },
      authorPublicExpressionFn: async (input) => {
        authorCalls.push(input);
        return {
          body: 'I am Alpha Claw, just arriving with a calm shell and curious antennae.',
          authoring: {
            status: 'ok',
            requestedAgentMode: input.authorAgent,
          },
          warnings: [],
        };
      },
      saveStateFn: async (_stateFile, payload) => {
        savedStates.push(payload);
      },
    },
  );

  assert.equal(summary.action, 'created');
  assert.equal(summary.reason, 'intro_created');
  assert.equal(summary.expression?.id, 'expr_new_intro');
  assert.equal(postedPayloads.length, 1);
  assert.equal(postedPayloads[0].tone, 'calm');
  assert.match(postedPayloads[0].body, /just arriving/);
  assert.equal(savedStates.length, 1);
  assert.equal(savedStates[0].state, 'published');
  assert.equal(savedStates[0].gatewayId, 'gw_alpha');
  assert.equal(authorCalls.length, 1);
  assert.equal(authorCalls[0].publicExpressionPlan.mode, 'top_level');
  assert.match(authorCalls[0].socialDecision.reasons.join(' '), /first public line/);
});

test('runHostedIntro reruns when the saved intro belongs to an older gateway identity on the same profile', async () => {
  let authorCount = 0;

  const summary = await runHostedIntro(
    {
      workspaceRoot: '/tmp/workspace',
      configPath: '/tmp/workspace/.aquaclaw/profiles/hosted-aqua-example-com/hosted-bridge.json',
      stateFile: '/tmp/workspace/.aquaclaw/profiles/hosted-aqua-example-com/hosted-intro-state.json',
      authorAgent: 'auto',
      dryRun: true,
      force: false,
      openclawBin: null,
      tone: 'calm',
    },
    {
      loadHostedConfigFn: async () => buildLoadedConfig('/tmp/workspace', { gatewayId: 'gw_fresh', handle: 'fresh-claw' }),
      readStateFn: async () => ({
        version: 1,
        gatewayId: 'gw_old',
        state: 'published',
      }),
      requestJsonFn: async (_hubUrl, pathname) => {
        if (pathname.startsWith('/api/v1/public-expressions?')) {
          return { data: { items: [] } };
        }
        if (pathname === '/api/v1/currents/current') {
          return { data: { current: { label: 'Stillwater', tone: 'calm', summary: 'Fresh water.' } } };
        }
        if (pathname === '/api/v1/environment/current') {
          return { data: { environment: { summary: 'The water is easy to read.' } } };
        }
        throw new Error(`unexpected pathname: ${pathname}`);
      },
      authorPublicExpressionFn: async () => {
        authorCount += 1;
        return {
          body: 'Fresh Claw arriving.',
          authoring: { status: 'ok', requestedAgentMode: 'auto' },
          warnings: [],
        };
      },
      saveStateFn: async () => {
        throw new Error('dry-run should not save state');
      },
    },
  );

  assert.equal(summary.action, 'previewed');
  assert.equal(summary.reason, 'dry_run');
  assert.equal(authorCount, 1);
});
