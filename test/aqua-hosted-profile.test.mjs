#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadActiveHostedProfileSync, resolveHostedProfilePaths } from '../scripts/hosted-aqua-common.mjs';
import { migrateLegacyHostedProfile } from '../scripts/aqua-hosted-profile.mjs';

async function writeLegacyHostedFixture(workspaceRoot) {
  const stateRoot = path.join(workspaceRoot, '.aquaclaw');
  await mkdir(path.join(stateRoot, 'mirror', 'threads'), { recursive: true });
  await writeFile(
    path.join(stateRoot, 'hosted-bridge.json'),
    JSON.stringify(
      {
        version: 1,
        mode: 'hosted',
        hubUrl: 'https://aqua.example.com',
        workspaceRoot,
        gateway: {
          id: 'gw_1',
          handle: 'silver-claw',
          displayName: 'Silver Claw',
        },
        credential: {
          token: 'secret',
          kind: 'gateway_bearer',
        },
        runtime: {
          runtimeId: 'rt_1',
          installationId: 'inst_1',
          label: 'Silver Claw Runtime',
          source: 'test',
        },
        connectedAt: '2026-03-18T08:00:00.000Z',
        updatedAt: '2026-03-18T08:00:00.000Z',
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(stateRoot, 'hosted-pulse-state.json'),
    JSON.stringify({ lastPulseAt: '2026-03-18T08:01:00.000Z' }, null, 2),
  );
  await writeFile(
    path.join(stateRoot, 'runtime-heartbeat-state.json'),
    JSON.stringify({ lastHeartbeatAt: '2026-03-18T08:02:00.000Z' }, null, 2),
  );
  await writeFile(
    path.join(stateRoot, 'mirror', 'state.json'),
    JSON.stringify({ mode: 'hosted', lastEventAt: '2026-03-18T08:03:00.000Z' }, null, 2),
  );
  await writeFile(
    path.join(stateRoot, 'mirror', 'threads', 'public.json'),
    JSON.stringify({ items: [{ id: 'expr_1' }] }, null, 2),
  );
}

test('migrateLegacyHostedProfile copies legacy config and state into a named hosted profile', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-migrate-legacy-'));
  await writeLegacyHostedFixture(workspaceRoot);

  const result = await migrateLegacyHostedProfile({ workspaceRoot });
  const profilePaths = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-aqua-example-com',
  });

  assert.equal(result.profileId, 'hosted-aqua-example-com');
  assert.equal(result.configPath, profilePaths.configPath);
  assert.equal(result.copied.pulseState, true);
  assert.equal(result.copied.heartbeatState, true);
  assert.equal(result.copied.mirrorRoot, true);

  const savedConfig = JSON.parse(await readFile(profilePaths.configPath, 'utf8'));
  assert.deepEqual(savedConfig.profile, {
    id: 'hosted-aqua-example-com',
    type: 'hosted',
  });

  const pointer = loadActiveHostedProfileSync({ workspaceRoot }).pointer;
  assert.equal(pointer?.profileId, 'hosted-aqua-example-com');

  const copiedPulse = JSON.parse(await readFile(profilePaths.pulseStatePath, 'utf8'));
  const copiedHeartbeat = JSON.parse(await readFile(profilePaths.heartbeatStatePath, 'utf8'));
  const copiedMirrorState = JSON.parse(await readFile(path.join(profilePaths.mirrorRoot, 'state.json'), 'utf8'));
  const copiedMirrorThread = JSON.parse(
    await readFile(path.join(profilePaths.mirrorRoot, 'threads', 'public.json'), 'utf8'),
  );

  assert.equal(copiedPulse.lastPulseAt, '2026-03-18T08:01:00.000Z');
  assert.equal(copiedHeartbeat.lastHeartbeatAt, '2026-03-18T08:02:00.000Z');
  assert.equal(copiedMirrorState.lastEventAt, '2026-03-18T08:03:00.000Z');
  assert.equal(copiedMirrorThread.items[0].id, 'expr_1');
});

test('migrateLegacyHostedProfile refuses to overwrite an existing saved profile without force', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-migrate-legacy-force-'));
  await writeLegacyHostedFixture(workspaceRoot);

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
        profile: { id: 'hosted-aqua-example-com', type: 'hosted' },
        credential: { token: 'already-here', kind: 'gateway_bearer' },
        gateway: { id: 'gw_existing', handle: 'existing', displayName: 'Existing' },
        runtime: { runtimeId: 'rt_existing', installationId: 'inst_existing', label: 'Existing', source: 'test' },
      },
      null,
      2,
    ),
  );

  await assert.rejects(
    () => migrateLegacyHostedProfile({ workspaceRoot }),
    /hosted profile config already exists/,
  );
});
