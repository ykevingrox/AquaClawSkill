import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  activateLocalProfile,
  migrateRootLocalState,
  showLocalProfileStatus,
} from '../scripts/aqua-local-profile.mjs';
import {
  loadActiveProfileSync,
  resolveHeartbeatStatePath,
  resolveHostedProfilePaths,
  resolveMirrorRootPath,
} from '../scripts/hosted-aqua-common.mjs';

test('activateLocalProfile creates local profile metadata and switches path resolution to that profile', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-activate-local-profile-'));

  try {
    const result = await activateLocalProfile({
      workspaceRoot,
      profileId: 'local-sandbox',
      label: 'Local Sandbox',
    });

    const profileJson = JSON.parse(await readFile(result.profilePaths.profilePath, 'utf8'));

    assert.equal(profileJson.type, 'local');
    assert.equal(profileJson.profileId, 'local-sandbox');
    assert.equal(profileJson.label, 'Local Sandbox');
    assert.equal(loadActiveProfileSync({ workspaceRoot }).pointer?.type, 'local');
    assert.equal(resolveMirrorRootPath({ workspaceRoot, mode: 'local' }), result.profilePaths.mirrorRoot);
    assert.equal(resolveHeartbeatStatePath({ workspaceRoot, mode: 'auto' }), result.profilePaths.heartbeatStatePath);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('migrateRootLocalState copies root local state into the selected profile namespace', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-migrate-local-profile-'));

  try {
    const stateRoot = path.join(workspaceRoot, '.aquaclaw');
    await mkdir(path.join(stateRoot, 'mirror', 'sea-events'), { recursive: true });
    await mkdir(path.join(stateRoot, 'community-memory', 'notes'), { recursive: true });
    await mkdir(path.join(stateRoot, 'diary-digests'), { recursive: true });
    await mkdir(path.join(stateRoot, 'memory-synthesis'), { recursive: true });
    await mkdir(path.join(stateRoot, 'sea-diary-context'), { recursive: true });

    await writeFile(path.join(stateRoot, 'runtime-heartbeat-state.json'), '{"mode":"local"}\n', 'utf8');
    await writeFile(path.join(stateRoot, 'mirror', 'state.json'), '{"mode":"local"}\n', 'utf8');
    await writeFile(path.join(stateRoot, 'mirror', 'sea-events', '2026-03-23.ndjson'), '{"id":"sea-1"}\n', 'utf8');
    await writeFile(path.join(stateRoot, 'community-memory', 'state.json'), '{"version":1}\n', 'utf8');
    await writeFile(path.join(stateRoot, 'diary-digests', '2026-03-23.json'), '{"targetDate":"2026-03-23"}\n', 'utf8');
    await writeFile(path.join(stateRoot, 'memory-synthesis', '2026-03-23.json'), '{"targetDate":"2026-03-23"}\n', 'utf8');
    await writeFile(path.join(stateRoot, 'sea-diary-context', '2026-03-23.json'), '{"targetDate":"2026-03-23"}\n', 'utf8');

    const result = await migrateRootLocalState({
      workspaceRoot,
      profileId: 'local-sandbox',
    });
    const profilePaths = resolveHostedProfilePaths({
      workspaceRoot,
      profileId: 'local-sandbox',
    });

    assert.equal(result.copied.mirrorRoot, true);
    assert.equal(result.copied.communityMemoryRoot, true);
    assert.equal(result.copied.heartbeatStatePath, true);
    assert.equal(result.copied.diaryDigestRoot, true);
    assert.equal(result.copied.memorySynthesisRoot, true);
    assert.equal(result.copied.seaDiaryContextRoot, true);
    assert.equal(loadActiveProfileSync({ workspaceRoot }).pointer?.profileId, 'local-sandbox');

    assert.equal(
      await readFile(path.join(profilePaths.mirrorRoot, 'sea-events', '2026-03-23.ndjson'), 'utf8'),
      '{"id":"sea-1"}\n',
    );
    assert.equal(
      await readFile(path.join(profilePaths.communityMemoryRoot, 'state.json'), 'utf8'),
      '{"version":1}\n',
    );
    assert.equal(
      await readFile(path.join(profilePaths.profileRoot, 'diary-digests', '2026-03-23.json'), 'utf8'),
      '{"targetDate":"2026-03-23"}\n',
    );
    assert.equal(
      await readFile(path.join(profilePaths.profileRoot, 'memory-synthesis', '2026-03-23.json'), 'utf8'),
      '{"targetDate":"2026-03-23"}\n',
    );
    assert.equal(
      await readFile(path.join(profilePaths.profileRoot, 'sea-diary-context', '2026-03-23.json'), 'utf8'),
      '{"targetDate":"2026-03-23"}\n',
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('showLocalProfileStatus reports active local profile and root fallback paths', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-show-local-profile-'));

  try {
    await activateLocalProfile({
      workspaceRoot,
      profileId: 'local-sandbox',
    });

    const result = await showLocalProfileStatus({ workspaceRoot });

    assert.equal(result.activePointer?.type, 'local');
    assert.equal(result.activeLocalProfileId, 'local-sandbox');
    assert.match(result.activeLocalPaths.mirrorRoot, /profiles\/local-sandbox\/mirror$/);
    assert.match(result.rootLocalPaths.mirrorRoot, /\.aquaclaw\/mirror$/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
