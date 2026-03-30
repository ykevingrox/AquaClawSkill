#!/usr/bin/env node

import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const REQUIRED_FILES = [
  'SKILL.md',
  'README.md',
  'agents/openai.yaml',
  'references/doc-map.md',
  'references/command-reference.md',
  'references/public-install.md',
  'references/beginner-install-connect-switch.md',
  'references/clawhub-release.md',
];

const REQUIRED_EXECUTABLES = [
  'scripts/aqua-profile.sh',
  'scripts/aqua-hosted-onboard.sh',
  'scripts/aqua-hosted-profile.sh',
  'scripts/build-openclaw-aqua-brief.sh',
  'scripts/install-openclaw-heartbeat-cron.sh',
  'scripts/sync-aquaclaw-tools-md.sh',
];

function printHelp() {
  console.log(`Usage: check-clawhub-release.mjs [options]

Options:
  --repo-root <path>   Skill repo root (default: script parent)
  --require-clean      Fail if git worktree is dirty
  --json               Print machine-readable JSON
  --help               Show this message
`);
}

function parseArgs(argv) {
  const options = {
    json: false,
    repoRoot: DEFAULT_REPO_ROOT,
    requireClean: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--require-clean') {
      options.requireClean = true;
      continue;
    }
    if (arg === '--repo-root') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('--repo-root requires a value');
      }
      options.repoRoot = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg.startsWith('--repo-root=')) {
      options.repoRoot = path.resolve(arg.slice('--repo-root='.length));
      continue;
    }

    throw new Error(`unknown option: ${arg}`);
  }

  return options;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseSkillFrontmatter(raw) {
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== '---') {
    throw new Error('SKILL.md must start with frontmatter');
  }

  const endIndex = lines.indexOf('---', 1);
  if (endIndex === -1) {
    throw new Error('SKILL.md frontmatter is missing a closing delimiter');
  }

  const frontmatter = new Map();
  for (const line of lines.slice(1, endIndex)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      throw new Error(`unsupported SKILL.md frontmatter line: ${line}`);
    }
    frontmatter.set(match[1], match[2]);
  }

  return frontmatter;
}

function parseQuotedOrBare(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isValidSemver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(String(value || '').trim());
}

function parseSingleLineMetadata(frontmatter) {
  const metadataRaw = frontmatter.get('metadata');
  if (metadataRaw === undefined) {
    throw new Error('SKILL.md frontmatter is missing metadata');
  }

  const trimmed = metadataRaw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    throw new Error('SKILL.md metadata must be single-line JSON');
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SKILL.md metadata JSON is invalid: ${message}`);
  }

  return parsed;
}

function extractOpenAiInterface(raw) {
  const get = (key) => {
    const match = raw.match(new RegExp(`^\\s*${key}:\\s*"([^"]+)"\\s*$`, 'm'));
    return match ? match[1] : null;
  };

  return {
    displayName: get('display_name'),
    shortDescription: get('short_description'),
    defaultPrompt: get('default_prompt'),
  };
}

async function isExecutable(filePath) {
  const details = await stat(filePath);
  return (details.mode & 0o111) !== 0;
}

async function readGitStatus(repoRoot) {
  try {
    const { stdout } = await execFile('git', ['-C', repoRoot, 'status', '--short']);
    const lines = stdout
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean);
    return {
      available: true,
      clean: lines.length === 0,
      lines,
    };
  } catch (error) {
    return {
      available: false,
      clean: null,
      lines: [],
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runReleaseCheck({
  repoRoot = DEFAULT_REPO_ROOT,
  requireClean = false,
} = {}) {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const failures = [];
  const warnings = [];

  const missingFiles = [];
  for (const relativePath of REQUIRED_FILES) {
    if (!(await exists(path.join(resolvedRepoRoot, relativePath)))) {
      missingFiles.push(relativePath);
    }
  }
  if (missingFiles.length > 0) {
    failures.push(`missing required files: ${missingFiles.join(', ')}`);
  }

  let skill = null;
  let metadata = null;
  if ((await exists(path.join(resolvedRepoRoot, 'SKILL.md')))) {
    const skillRaw = await readFile(path.join(resolvedRepoRoot, 'SKILL.md'), 'utf8');
    const frontmatter = parseSkillFrontmatter(skillRaw);
    const name = parseQuotedOrBare(frontmatter.get('name'));
    const version = parseQuotedOrBare(frontmatter.get('version'));
    const description = parseQuotedOrBare(frontmatter.get('description'));
    const homepage = parseQuotedOrBare(frontmatter.get('homepage'));

    if (!name) {
      failures.push('SKILL.md frontmatter is missing name');
    }
    if (!version) {
      failures.push('SKILL.md frontmatter is missing version');
    } else if (!isValidSemver(version)) {
      failures.push('SKILL.md frontmatter version must be valid semver');
    }
    if (!description) {
      failures.push('SKILL.md frontmatter is missing description');
    }
    if (!homepage) {
      warnings.push('SKILL.md frontmatter does not declare homepage');
    }

    try {
      metadata = parseSingleLineMetadata(frontmatter);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }

    skill = {
      name,
      version,
      description,
      homepage,
    };

    if (metadata?.openclaw?.requires?.bins && !Array.isArray(metadata.openclaw.requires.bins)) {
      failures.push('SKILL.md metadata.openclaw.requires.bins must be an array');
    }
    if (metadata?.openclaw?.requires?.env && !Array.isArray(metadata.openclaw.requires.env)) {
      failures.push('SKILL.md metadata.openclaw.requires.env must be an array');
    }
  }

  let openAiInterface = null;
  if (await exists(path.join(resolvedRepoRoot, 'agents/openai.yaml'))) {
    const openAiRaw = await readFile(path.join(resolvedRepoRoot, 'agents/openai.yaml'), 'utf8');
    openAiInterface = extractOpenAiInterface(openAiRaw);
    if (!openAiInterface.displayName) {
      failures.push('agents/openai.yaml is missing interface.display_name');
    }
    if (!openAiInterface.shortDescription) {
      failures.push('agents/openai.yaml is missing interface.short_description');
    }
    if (!openAiInterface.defaultPrompt) {
      failures.push('agents/openai.yaml is missing interface.default_prompt');
    }
  }

  const nonExecutable = [];
  for (const relativePath of REQUIRED_EXECUTABLES) {
    const absolutePath = path.join(resolvedRepoRoot, relativePath);
    if (!(await exists(absolutePath))) {
      failures.push(`missing required executable: ${relativePath}`);
      continue;
    }
    if (!(await isExecutable(absolutePath))) {
      nonExecutable.push(relativePath);
    }
  }
  if (nonExecutable.length > 0) {
    failures.push(`required scripts are not executable: ${nonExecutable.join(', ')}`);
  }

  const git = await readGitStatus(resolvedRepoRoot);
  if (!git.available) {
    warnings.push(`git status unavailable: ${git.warning}`);
  } else if (!git.clean) {
    const summary = `git worktree is dirty (${git.lines.length} path(s))`;
    if (requireClean) {
      failures.push(summary);
    } else {
      warnings.push(summary);
    }
  }

  return {
    ok: failures.length === 0,
    repoRoot: resolvedRepoRoot,
    requireClean,
    failures,
    warnings,
    skill,
    metadata,
    openAiInterface,
    git,
    suggestedCommands: {
      installCli: 'npm install -g clawhub',
      login: 'clawhub login',
      whoami: 'clawhub whoami',
      publish: 'clawhub publish .',
      inspect: 'clawhub inspect aquaclaw-openclaw-bridge',
      install: 'clawhub install aquaclaw-openclaw-bridge',
      syncDryRun: 'clawhub sync --root ~/.openclaw/workspace/skills --all --dry-run',
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    '# ClawHub Release Check',
    `- Repo root: ${result.repoRoot}`,
    `- Result: ${result.ok ? 'pass' : 'fail'}`,
    `- Require clean: ${result.requireClean ? 'yes' : 'no'}`,
  ];

  if (result.skill?.name) {
    lines.push(`- Skill name: ${result.skill.name}`);
  }
  if (result.skill?.version) {
    lines.push(`- Skill version: ${result.skill.version}`);
  }
  if (result.skill?.homepage) {
    lines.push(`- Homepage: ${result.skill.homepage}`);
  }
  if (result.git.available) {
    lines.push(`- Git status: ${result.git.clean ? 'clean' : 'dirty'}`);
  }

  lines.push('');
  lines.push('## Suggested Commands');
  lines.push(`- Install CLI: \`${result.suggestedCommands.installCli}\``);
  lines.push(`- Login: \`${result.suggestedCommands.login}\``);
  lines.push(`- Verify account: \`${result.suggestedCommands.whoami}\``);
  lines.push(`- Publish: \`${result.suggestedCommands.publish}\``);
  lines.push(`- Inspect: \`${result.suggestedCommands.inspect}\``);
  lines.push(`- End-user install: \`${result.suggestedCommands.install}\``);
  lines.push(`- Whole-dir dry run: \`${result.suggestedCommands.syncDryRun}\``);

  if (result.failures.length > 0) {
    lines.push('');
    lines.push('## Failures');
    for (const failure of result.failures) {
      lines.push(`- ${failure}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('## Warnings');
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runReleaseCheck(options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderMarkdown(result));
  }

  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
