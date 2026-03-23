#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { activateLocalProfile } from '../scripts/aqua-local-profile.mjs';
import { listProfiles, showCurrentProfile, switchProfile } from '../scripts/aqua-profile.mjs';
import {
  createProfileMetadata,
  loadActiveProfileSync,
  resolveHostedProfilePaths,
  saveProfileMetadata,
} from '../scripts/hosted-aqua-common.mjs';

async function writeHostedProfileFixture(workspaceRoot, profileId, hubUrl = 'https://aqua.example.com') {
  const profilePaths = resolveHostedProfilePaths({
    workspaceRoot,
    profileId,
  });
  await mkdir(profilePaths.profileRoot, { recursive: true });
  await saveProfileMetadata(
    profilePaths.profilePath,
    createProfileMetadata({
      type: 'hosted',
      profileId,
      label: 'Hosted Example',
      hubUrl,
    }),
  );
  await writeFile(
    profilePaths.configPath,
    JSON.stringify(
      {
        version: 1,
        mode: 'hosted',
        hubUrl,
        profile: {
          id: profileId,
          type: 'hosted',
        },
        credential: {
          token: 'secret',
          kind: 'gateway_bearer',
        },
        gateway: {
          id: 'gw_1',
          handle: 'silver-claw',
          displayName: 'Silver Claw',
        },
        runtime: {
          runtimeId: 'rt_1',
          installationId: 'inst_1',
          label: 'Hosted Example',
          source: 'test',
        },
        updatedAt: '2026-03-23T10:00:00.000Z',
      },
      null,
      2,
    ),
  );
  return profilePaths;
}

async function writeLegacyHostedFixture(workspaceRoot, hubUrl = 'https://legacy.example.com') {
  const stateRoot = path.join(workspaceRoot, '.aquaclaw');
  await mkdir(stateRoot, { recursive: true });
  await writeFile(
    path.join(stateRoot, 'hosted-bridge.json'),
    JSON.stringify(
      {
        version: 1,
        mode: 'hosted',
        hubUrl,
        credential: {
          token: 'secret',
          kind: 'gateway_bearer',
        },
        gateway: {
          id: 'gw_legacy',
          handle: 'legacy-claw',
          displayName: 'Legacy Claw',
        },
        runtime: {
          runtimeId: 'rt_legacy',
          installationId: 'inst_legacy',
          label: 'Legacy Example',
          source: 'test',
        },
        updatedAt: '2026-03-23T09:00:00.000Z',
      },
      null,
      2,
    ),
  );
}

test('listProfiles reports local, hosted, and legacy entries together', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-profile-list-'));

  try {
    await activateLocalProfile({
      workspaceRoot,
      profileId: 'local-sandbox',
      label: 'Local Sandbox',
    });
    await writeHostedProfileFixture(workspaceRoot, 'hosted-aqua-example-com');
    await writeLegacyHostedFixture(workspaceRoot);

    const result = await listProfiles({ workspaceRoot });
    const local = result.items.find((item) => item.profileId === 'local-sandbox');
    const hosted = result.items.find((item) => item.profileId === 'hosted-aqua-example-com');
    const legacy = result.items.find((item) => item.profileId === 'legacy');

    assert.equal(result.activePointer?.type, 'local');
    assert.equal(local?.type, 'local');
    assert.equal(local?.active, true);
    assert.equal(hosted?.type, 'hosted');
    assert.equal(hosted?.hubUrl, 'https://aqua.example.com');
    assert.equal(legacy?.source, 'legacy');
    assert.equal(legacy?.hubUrl, 'https://legacy.example.com');
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('switchProfile activates a named hosted profile from the unified command', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-profile-switch-hosted-'));

  try {
    await writeHostedProfileFixture(workspaceRoot, 'hosted-aqua-example-com');

    const result = await switchProfile({
      workspaceRoot,
      profileId: 'hosted-aqua-example-com',
    });

    assert.equal(result.selectionKind, 'hosted');
    assert.equal(result.selected?.profileId, 'hosted-aqua-example-com');
    assert.equal(loadActiveProfileSync({ workspaceRoot }).pointer?.type, 'hosted');
    assert.equal(loadActiveProfileSync({ workspaceRoot }).pointer?.profileId, 'hosted-aqua-example-com');
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('switchProfile activates a named local profile from the unified command', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-profile-switch-local-'));

  try {
    await activateLocalProfile({
      workspaceRoot,
      profileId: 'local-sandbox',
      label: 'Local Sandbox',
    });
    await writeHostedProfileFixture(workspaceRoot, 'hosted-aqua-example-com');

    await switchProfile({
      workspaceRoot,
      profileId: 'hosted-aqua-example-com',
    });

    const result = await switchProfile({
      workspaceRoot,
      profileId: 'local-sandbox',
    });

    assert.equal(result.selectionKind, 'local');
    assert.equal(result.selected?.profileId, 'local-sandbox');
    assert.equal(loadActiveProfileSync({ workspaceRoot }).pointer?.type, 'local');
    assert.equal(loadActiveProfileSync({ workspaceRoot }).pointer?.profileId, 'local-sandbox');
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('showCurrentProfile falls back to legacy hosted config when no active pointer exists', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-profile-show-legacy-'));

  try {
    await writeLegacyHostedFixture(workspaceRoot);

    const result = await showCurrentProfile({ workspaceRoot });

    assert.equal(result.selectionKind, 'legacy');
    assert.equal(result.selected?.profileId, 'legacy');
    assert.match(result.selected?.configPath ?? '', /\.aquaclaw\/hosted-bridge\.json$/);
    assert.match(result.selected?.mirrorRoot ?? '', /\.aquaclaw\/mirror$/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
