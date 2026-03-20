#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runReleaseCheck } from '../scripts/check-clawhub-release.mjs';

async function createFixture(repoRoot, { metadataLine } = {}) {
  await mkdir(path.join(repoRoot, 'agents'), { recursive: true });
  await mkdir(path.join(repoRoot, 'references'), { recursive: true });
  await mkdir(path.join(repoRoot, 'scripts'), { recursive: true });

  await writeFile(
    path.join(repoRoot, 'SKILL.md'),
    [
      '---',
      'name: aquaclaw-openclaw-bridge',
      'version: 0.1.0',
      'description: "Bridge AquaClaw into OpenClaw"',
      'homepage: https://github.com/example/AquaClawSkill',
      metadataLine ??
        'metadata: {"openclaw":{"homepage":"https://github.com/example/AquaClawSkill","requires":{"bins":["node","npm","openclaw"],"env":["OPENCLAW_WORKSPACE_ROOT"]}}}',
      '---',
      '',
      '# Test Skill',
      '',
    ].join('\n'),
  );

  await writeFile(
    path.join(repoRoot, 'README.md'),
    '# README\n',
  );
  await writeFile(
    path.join(repoRoot, 'agents', 'openai.yaml'),
    [
      'interface:',
      '  display_name: "AquaClaw Bridge"',
      '  short_description: "Join Aqua or read Aqua state"',
      '  default_prompt: "Use the skill."',
      '',
    ].join('\n'),
  );
  await writeFile(path.join(repoRoot, 'references', 'public-install.md'), '# Public Install\n');
  await writeFile(
    path.join(repoRoot, 'references', 'beginner-install-connect-switch.md'),
    '# Beginner\n',
  );
  await writeFile(path.join(repoRoot, 'references', 'doc-map.md'), '# Doc Map\n');
  await writeFile(path.join(repoRoot, 'references', 'command-reference.md'), '# Command Reference\n');
  await writeFile(path.join(repoRoot, 'references', 'clawhub-release.md'), '# Release\n');

  const executableScripts = [
    'aqua-hosted-onboard.sh',
    'aqua-hosted-profile.sh',
    'build-openclaw-aqua-brief.sh',
    'install-openclaw-heartbeat-cron.sh',
    'sync-aquaclaw-tools-md.sh',
  ];

  for (const script of executableScripts) {
    const filePath = path.join(repoRoot, 'scripts', script);
    await writeFile(filePath, '#!/usr/bin/env bash\n');
    await chmod(filePath, 0o755);
  }
}

test('runReleaseCheck passes on a minimal valid ClawHub-ready repo fixture', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-release-check-'));
  await createFixture(repoRoot);

  const result = await runReleaseCheck({ repoRoot });

  assert.equal(result.ok, true);
  assert.equal(result.skill?.name, 'aquaclaw-openclaw-bridge');
  assert.equal(result.openAiInterface?.displayName, 'AquaClaw Bridge');
  assert.equal(result.failures.length, 0);
});

test('runReleaseCheck rejects missing or invalid semver versions', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-release-check-version-'));
  await createFixture(repoRoot);

  await writeFile(
    path.join(repoRoot, 'SKILL.md'),
    [
      '---',
      'name: aquaclaw-openclaw-bridge',
      'version: latest',
      'description: "Bridge AquaClaw into OpenClaw"',
      'homepage: https://github.com/example/AquaClawSkill',
      'metadata: {"openclaw":{"homepage":"https://github.com/example/AquaClawSkill","requires":{"bins":["node","npm","openclaw"],"env":["OPENCLAW_WORKSPACE_ROOT"]}}}',
      '---',
      '',
      '# Test Skill',
      '',
    ].join('\n'),
  );

  const result = await runReleaseCheck({ repoRoot });

  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes('valid semver')));
});

test('runReleaseCheck rejects non-single-line metadata frontmatter', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-release-check-bad-'));
  await createFixture(repoRoot, {
    metadataLine: 'metadata:',
  });

  const result = await runReleaseCheck({ repoRoot });

  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes('single-line JSON')));
});
