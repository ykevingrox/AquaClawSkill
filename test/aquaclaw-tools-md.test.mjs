#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildToolsManagedState,
  inspectManagedBlock,
  renderToolsManagedBlock,
  resolveToolsPath,
  syncManagedToolsBlock,
  TOOLS_MANAGED_BLOCK_END,
  TOOLS_MANAGED_BLOCK_START,
} from '../scripts/aquaclaw-tools-md.mjs';
import { saveActiveLocalProfile } from '../scripts/hosted-aqua-common.mjs';

test('inspectManagedBlock finds a single managed block and rejects duplicates', () => {
  const content = [
    '# TOOLS',
    '',
    TOOLS_MANAGED_BLOCK_START,
    'managed',
    TOOLS_MANAGED_BLOCK_END,
    '',
  ].join('\n');

  const inspected = inspectManagedBlock(content);
  assert.equal(inspected.present, true);
  assert.ok(Number.isInteger(inspected.start));
  assert.ok(Number.isInteger(inspected.end));

  assert.throws(
    () =>
      inspectManagedBlock(
        `${content}\n${TOOLS_MANAGED_BLOCK_START}\nextra\n${TOOLS_MANAGED_BLOCK_END}\n`,
      ),
    /at most one AquaClaw managed block/,
  );
});

test('buildToolsManagedState prefers hosted config when present and valid', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-tools-state-'));
  const hostedConfigPath = path.join(workspaceRoot, '.aquaclaw', 'hosted-bridge.json');
  const repoPath = path.join(workspaceRoot, 'gateway-hub');

  await mkdir(path.dirname(hostedConfigPath), { recursive: true });
  await mkdir(repoPath, { recursive: true });
  await writeFile(
    path.join(repoPath, 'package.json'),
    JSON.stringify({ name: 'gateway-hub' }, null, 2),
  );
  await writeFile(
    hostedConfigPath,
    JSON.stringify(
      {
        version: 1,
        mode: 'hosted',
        hubUrl: 'https://aqua.example.com',
        credential: {
          token: 'secret',
          kind: 'gateway_bearer',
        },
        gateway: {
          displayName: 'Silver Claw',
          handle: 'silver-claw',
        },
        runtime: {
          runtimeId: 'runtime-123',
          installationId: 'installation-123',
          label: 'Silver Claw Runtime',
          source: 'test',
        },
      },
      null,
      2,
    ),
  );

  const state = await buildToolsManagedState({
    workspaceRoot,
    repoPath,
    generatedAt: '2026-03-18T01:02:03.000Z',
  });

  assert.equal(state.activeTarget, 'hosted aqua.example.com');
  assert.equal(state.hosted.valid, true);
  assert.equal(state.hosted.gatewayLabel, 'Silver Claw (@silver-claw)');
  assert.equal(state.repoPath, repoPath);
  assert.equal(
    state.commands.combinedBrief.includes('bash ') && state.commands.combinedBrief.includes('build-openclaw-aqua-brief.sh'),
    true,
  );
  assert.equal(state.commands.hostedOnboard.includes('bash '), true);
});

test('buildToolsManagedState reflects an active local profile in the managed summary', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-tools-local-state-'));
  const hostedConfigPath = path.join(workspaceRoot, '.aquaclaw', 'hosted-bridge.json');

  await mkdir(path.dirname(hostedConfigPath), { recursive: true });
  await writeFile(
    hostedConfigPath,
    JSON.stringify(
      {
        version: 1,
        mode: 'hosted',
        hubUrl: 'https://aqua.example.com',
        credential: {
          token: 'secret',
          kind: 'gateway_bearer',
        },
        gateway: {
          displayName: 'Silver Claw',
          handle: 'silver-claw',
        },
        runtime: {
          runtimeId: 'runtime-123',
          installationId: 'installation-123',
          label: 'Silver Claw Runtime',
          source: 'test',
        },
      },
      null,
      2,
    ),
  );

  await saveActiveLocalProfile({
    workspaceRoot,
    profileId: 'local-sandbox',
  });

  const state = await buildToolsManagedState({
    workspaceRoot,
    generatedAt: '2026-03-23T10:00:00.000Z',
  });
  const block = renderToolsManagedBlock(state);

  assert.equal(state.activeTarget, 'local profile local-sandbox');
  assert.equal(state.activeProfile?.type, 'local');
  assert.equal(state.local.active, true);
  assert.equal(state.hosted.valid, true);
  assert.match(block, /Active profile type: `local`/);
  assert.match(block, /Active profile id: `local-sandbox`/);
  assert.match(block, /Local mirror root:/);
  assert.match(block, /Hosted base URL: `https:\/\/aqua\.example\.com`/);
  assert.match(block, /Preferred profile show:/);
});

test('syncManagedToolsBlock updates an existing block without touching surrounding notes', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-tools-update-'));
  const toolsPath = resolveToolsPath({ workspaceRoot });

  await writeFile(
    toolsPath,
    [
      '# Notes',
      '',
      'before',
      '',
      TOOLS_MANAGED_BLOCK_START,
      'old block',
      TOOLS_MANAGED_BLOCK_END,
      '',
      'after',
      '',
    ].join('\n'),
  );

  const result = await syncManagedToolsBlock({
    workspaceRoot,
    apply: true,
    skipIfMissing: true,
    generatedAt: '2026-03-18T02:03:04.000Z',
  });

  assert.equal(result.action, 'updated');
  const nextContent = await readFile(toolsPath, 'utf8');
  assert.ok(nextContent.includes('before'));
  assert.ok(nextContent.includes('after'));
  assert.ok(nextContent.includes('AquaClaw Managed Summary'));
  assert.ok(nextContent.includes('Generated at: `2026-03-18T02:03:04.000Z`'));
});

test('syncManagedToolsBlock inserts a new block when explicitly requested', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-tools-insert-'));
  const toolsPath = resolveToolsPath({ workspaceRoot });

  await writeFile(toolsPath, '# Notes\n\noutside\n');

  const result = await syncManagedToolsBlock({
    workspaceRoot,
    apply: true,
    insert: true,
    generatedAt: '2026-03-18T03:04:05.000Z',
  });

  assert.equal(result.action, 'inserted');
  const nextContent = await readFile(toolsPath, 'utf8');
  assert.ok(nextContent.includes(TOOLS_MANAGED_BLOCK_START));
  assert.ok(nextContent.includes('Generated at: `2026-03-18T03:04:05.000Z`'));
});

test('syncManagedToolsBlock can create TOOLS.md when explicitly inserting into a missing file', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-tools-create-'));
  const toolsPath = resolveToolsPath({ workspaceRoot });

  const result = await syncManagedToolsBlock({
    workspaceRoot,
    apply: true,
    insert: true,
    generatedAt: '2026-03-18T04:05:06.000Z',
  });

  assert.equal(result.action, 'created');
  const nextContent = await readFile(toolsPath, 'utf8');
  assert.ok(nextContent.startsWith('# TOOLS.md - Local Notes'));
  assert.ok(nextContent.includes('AquaClaw Managed Summary'));
});

test('syncManagedToolsBlock skips missing blocks when requested', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-tools-skip-'));
  const toolsPath = resolveToolsPath({ workspaceRoot });

  await writeFile(toolsPath, '# Notes\n\noutside only\n');

  const result = await syncManagedToolsBlock({
    workspaceRoot,
    apply: true,
    skipIfMissing: true,
  });

  assert.equal(result.action, 'missing-skipped');
  const nextContent = await readFile(toolsPath, 'utf8');
  assert.equal(nextContent, '# Notes\n\noutside only\n');
});

test('renderToolsManagedBlock clearly labels derived mirror semantics', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-tools-render-'));
  const state = await buildToolsManagedState({
    workspaceRoot,
    generatedAt: '2026-03-18T05:06:07.000Z',
  });

  const block = renderToolsManagedBlock(state);

  assert.ok(block.includes('derived from `.aquaclaw/` state'));
  assert.ok(block.includes('Do not treat it as authoritative config'));
  assert.ok(block.includes('Preferred managed-block refresh'));
});
