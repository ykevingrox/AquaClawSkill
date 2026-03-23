#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildHostedProfileId,
  clearActiveHostedProfile,
  formatGatewayHandleLabel,
  formatPublicExpressionSpeakerLabel,
  formatSeaEventSummaryLine,
  loadActiveHostedProfileSync,
  parseHostedProfileIdFromConfigPath,
  resolveHeartbeatStatePath,
  resolveCommunityMemoryRootPath,
  resolveHostedConfigPath,
  resolveHostedProfilePaths,
  resolveHostedPulseStatePath,
  resolveMirrorRootPath,
  saveActiveHostedProfile,
} from '../scripts/hosted-aqua-common.mjs';

test('buildHostedProfileId derives a stable hosted profile slug from hub URL', () => {
  assert.equal(buildHostedProfileId('https://aqua.example.com'), 'hosted-aqua-example-com');
  assert.equal(buildHostedProfileId('https://Aqua.Example.com:8443'), 'hosted-aqua-example-com-8443');
});

test('active hosted profile pointer drives default hosted config and state paths', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-active-profile-'));
  const profilePaths = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-aqua-example-com',
  });

  await mkdir(profilePaths.profileRoot, { recursive: true });
  await writeFile(
    profilePaths.configPath,
    JSON.stringify(
      {
        version: 1,
        mode: 'hosted',
        hubUrl: 'https://aqua.example.com',
        credential: { token: 'secret', kind: 'gateway_bearer' },
        gateway: { id: 'gw_1', displayName: 'Silver Claw', handle: 'silver-claw' },
        runtime: { runtimeId: 'rt_1', installationId: 'inst_1', label: 'Silver', source: 'test' },
      },
      null,
      2,
    ),
  );

  await saveActiveHostedProfile({
    workspaceRoot,
    profileId: 'hosted-aqua-example-com',
    hubUrl: 'https://aqua.example.com',
    configPath: profilePaths.configPath,
  });

  assert.equal(resolveHostedConfigPath({ workspaceRoot }), profilePaths.configPath);
  assert.equal(resolveHostedPulseStatePath({ workspaceRoot }), profilePaths.pulseStatePath);
  assert.equal(resolveHeartbeatStatePath({ workspaceRoot, mode: 'auto' }), profilePaths.heartbeatStatePath);
  assert.equal(resolveMirrorRootPath({ workspaceRoot, mode: 'auto' }), profilePaths.mirrorRoot);
  assert.equal(resolveCommunityMemoryRootPath({ workspaceRoot }), profilePaths.communityMemoryRoot);

  const loadedPointer = loadActiveHostedProfileSync({ workspaceRoot });
  assert.equal(loadedPointer.pointer?.profileId, 'hosted-aqua-example-com');
});

test('explicit config paths bypass active profile pointer when requested', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-explicit-config-'));
  const explicitConfigPath = path.join(workspaceRoot, 'custom', 'hosted.json');

  await saveActiveHostedProfile({
    workspaceRoot,
    profileId: 'hosted-aqua-example-com',
    hubUrl: 'https://aqua.example.com',
    configPath: resolveHostedProfilePaths({
      workspaceRoot,
      profileId: 'hosted-aqua-example-com',
    }).configPath,
  });

  assert.equal(
    resolveHostedConfigPath({
      workspaceRoot,
      configPath: explicitConfigPath,
    }),
    explicitConfigPath,
  );
  assert.equal(
    parseHostedProfileIdFromConfigPath({
      workspaceRoot,
      configPath: explicitConfigPath,
    }),
    null,
  );
});

test('clearing the active hosted profile falls back to legacy root paths', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-clear-profile-'));
  const profilePaths = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-aqua-example-com',
  });

  await saveActiveHostedProfile({
    workspaceRoot,
    profileId: 'hosted-aqua-example-com',
    hubUrl: 'https://aqua.example.com',
    configPath: profilePaths.configPath,
  });
  await clearActiveHostedProfile({ workspaceRoot });

  assert.equal(
    resolveHostedConfigPath({ workspaceRoot }),
    path.join(workspaceRoot, '.aquaclaw', 'hosted-bridge.json'),
  );
  assert.equal(
    resolveHeartbeatStatePath({ workspaceRoot, mode: 'auto' }),
    path.join(workspaceRoot, '.aquaclaw', 'runtime-heartbeat-state.json'),
  );
  assert.equal(resolveMirrorRootPath({ workspaceRoot, mode: 'auto' }), path.join(workspaceRoot, '.aquaclaw', 'mirror'));
});

test('public-expression summary helpers keep actor and reply direction explicit', () => {
  assert.equal(formatGatewayHandleLabel({ handle: 'reef-cartographer' }), '@reef-cartographer');
  assert.equal(
    formatPublicExpressionSpeakerLabel({
      gateway: { handle: 'claw-local' },
      replyToGateway: { handle: 'reef-cartographer' },
    }),
    '@claw-local -> @reef-cartographer',
  );
  assert.equal(
    formatSeaEventSummaryLine({
      type: 'public_expression.replied',
      summary: 'I am tracing the same shape from here.',
      gateway: { handle: 'claw-local' },
      metadata: { replyToGatewayHandle: 'reef-cartographer' },
    }),
    'public_expression.replied - @claw-local -> @reef-cartographer: I am tracing the same shape from here.',
  );
});

test('non public-expression sea events keep the existing compact summary line', () => {
  assert.equal(
    formatSeaEventSummaryLine({
      type: 'current.changed',
      summary: 'A new current took shape: Crosswind Current',
    }),
    'current.changed - A new current took shape: Crosswind Current',
  );
});
