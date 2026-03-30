#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { chmod, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { getProcessEnvSnapshot, readEnvOptionalString } from './env-readers.mjs';
import {
  buildHostedProfileId,
  normalizeBaseUrl,
  parseHostedProfileIdFromConfigPath,
  resolveHostedConfigPath,
  resolveHostedProfilePaths,
  resolveWorkspaceRoot,
} from './hosted-aqua-common.mjs';

const PERMISSION_FAILURE_PATTERN = /\b(?:EACCES|EPERM)\b|permission denied|operation not permitted|not executable/i;
const LOCAL_STATE_FAILURE_PATTERN = /\bENOENT\b|no such file or directory|hosted Aqua config not found/i;
const OPENCLAW_GATEWAY_FAILURE_PATTERN =
  /GatewayClientRequestError|invalid cron\.(?:add|update) params|scheduler schema|health failed|ECONNREFUSED|connection refused|openclaw gateway|fetch failed/i;
const OPENCLAW_RUNTIME_STEP_TITLES = new Set([
  'Heartbeat Cron',
  'Hosted Pulse Service',
  'First Sea Introduction',
]);
const execFile = promisify(execFileCallback);

export function planHostedOnboardSelfHeal({
  title,
  stdout = '',
  stderr = '',
} = {}) {
  const combinedOutput = [stdout, stderr].filter(Boolean).join('\n');
  if (!combinedOutput.trim()) {
    return null;
  }

  const actions = [];
  let reason = null;

  if (PERMISSION_FAILURE_PATTERN.test(combinedOutput)) {
    reason = 'permissions';
    actions.push('normalize_skill_scripts', 'ensure_hosted_state');
  }

  if (LOCAL_STATE_FAILURE_PATTERN.test(combinedOutput)) {
    if (!reason) {
      reason = 'local_state';
    }
    actions.push('ensure_hosted_state');
  }

  if (OPENCLAW_RUNTIME_STEP_TITLES.has(title) && OPENCLAW_GATEWAY_FAILURE_PATTERN.test(combinedOutput)) {
    if (!reason) {
      reason = 'openclaw_runtime';
    }
    actions.push('normalize_skill_scripts', 'ensure_hosted_state', 'repair_openclaw_runtime');
  }

  if (!actions.length) {
    return null;
  }

  const uniqueActions = [];
  for (const action of actions) {
    if (!uniqueActions.includes(action)) {
      uniqueActions.push(action);
    }
  }

  return {
    title,
    reason,
    actions: uniqueActions,
  };
}

function resolveRepairPaths({
  workspaceRoot = null,
  configPath = null,
  hubUrl = null,
} = {}) {
  const resolvedWorkspaceRoot = resolveWorkspaceRoot(workspaceRoot ?? readEnvOptionalString('OPENCLAW_WORKSPACE_ROOT'));
  let resolvedConfigPath = null;
  let profileId = null;

  if (typeof configPath === 'string' && configPath.trim()) {
    resolvedConfigPath = resolveHostedConfigPath({
      workspaceRoot: resolvedWorkspaceRoot,
      configPath,
    });
    profileId = parseHostedProfileIdFromConfigPath({
      workspaceRoot: resolvedWorkspaceRoot,
      configPath: resolvedConfigPath,
    });
  }

  if (!profileId && typeof hubUrl === 'string' && hubUrl.trim()) {
    profileId = buildHostedProfileId(normalizeBaseUrl(hubUrl));
  }

  const profilePaths = profileId
    ? resolveHostedProfilePaths({
        workspaceRoot: resolvedWorkspaceRoot,
        profileId,
      })
    : null;

  return {
    workspaceRoot: resolvedWorkspaceRoot,
    stateRoot: path.join(resolvedWorkspaceRoot, '.aquaclaw'),
    configDir: resolvedConfigPath
      ? path.dirname(resolvedConfigPath)
      : profilePaths
        ? path.dirname(profilePaths.configPath)
        : null,
    profilePaths,
  };
}

async function normalizeSkillScriptPermissions({ skillRoot } = {}) {
  const resolvedSkillRoot =
    typeof skillRoot === 'string' && skillRoot.trim() ? path.resolve(skillRoot) : process.cwd();
  const scriptsDir = path.join(resolvedSkillRoot, 'scripts');
  let entries = [];

  try {
    entries = await readdir(scriptsDir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        ok: true,
        action: 'normalize_skill_scripts',
        touched: 0,
        scriptsDir,
      };
    }
    throw error;
  }

  let touched = 0;
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.endsWith('.sh') && !entry.name.endsWith('.mjs')) {
      continue;
    }
    await chmod(path.join(scriptsDir, entry.name), 0o755);
    touched += 1;
  }

  return {
    ok: true,
    action: 'normalize_skill_scripts',
    touched,
    scriptsDir,
  };
}

async function ensureHostedState({ workspaceRoot, configPath, hubUrl }) {
  const paths = resolveRepairPaths({ workspaceRoot, configPath, hubUrl });
  const directories = [
    paths.stateRoot,
    paths.configDir,
    paths.profilePaths?.profileRoot,
  ].filter(Boolean);

  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
  }

  return {
    ok: true,
    action: 'ensure_hosted_state',
    directories,
  };
}

function printCapturedOutput(stdout, stderr) {
  if (stdout) {
    process.stdout.write(stdout);
    if (!stdout.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }
  if (stderr) {
    process.stderr.write(stderr);
    if (!stderr.endsWith('\n')) {
      process.stderr.write('\n');
    }
  }
}

async function repairOpenClawRuntime({
  openclawBin = null,
} = {}) {
  const command =
    typeof openclawBin === 'string' && openclawBin.trim()
      ? openclawBin.trim()
      : readEnvOptionalString('OPENCLAW_BIN') ?? 'openclaw';
  console.error('AquaClaw: attempting one local OpenClaw repair pass (doctor --fix + gateway restart).');

  let doctor = { status: 0, stdout: '', stderr: '', error: null };
  try {
    const result = await execFile(command, ['doctor', '--fix', '--non-interactive', '--yes'], {
      env: getProcessEnvSnapshot(),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    doctor = {
      status: 0,
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr: typeof result.stderr === 'string' ? result.stderr : '',
      error: null,
    };
  } catch (error) {
    doctor = {
      status: typeof error?.code === 'number' ? error.code : 1,
      stdout: typeof error?.stdout === 'string' ? error.stdout : '',
      stderr: typeof error?.stderr === 'string' ? error.stderr : '',
      error: typeof error?.code === 'number' ? null : error?.message ?? String(error),
    };
  }
  const doctorStdout = doctor.stdout;
  const doctorStderr = doctor.stderr;
  printCapturedOutput(doctorStdout, doctorStderr);
  if (doctor.error) {
    return {
      ok: false,
      action: 'repair_openclaw_runtime',
      failedAt: 'doctor',
      error: doctor.error,
    };
  }
  if ((doctor.status ?? 0) !== 0) {
    return {
      ok: false,
      action: 'repair_openclaw_runtime',
      failedAt: 'doctor',
      status: doctor.status ?? 1,
    };
  }

  let restart = { status: 0, stdout: '', stderr: '', error: null };
  try {
    const result = await execFile(command, ['gateway', 'restart'], {
      env: getProcessEnvSnapshot(),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    restart = {
      status: 0,
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr: typeof result.stderr === 'string' ? result.stderr : '',
      error: null,
    };
  } catch (error) {
    restart = {
      status: typeof error?.code === 'number' ? error.code : 1,
      stdout: typeof error?.stdout === 'string' ? error.stdout : '',
      stderr: typeof error?.stderr === 'string' ? error.stderr : '',
      error: typeof error?.code === 'number' ? null : error?.message ?? String(error),
    };
  }
  const restartStdout = restart.stdout;
  const restartStderr = restart.stderr;
  printCapturedOutput(restartStdout, restartStderr);
  if (restart.error) {
    return {
      ok: false,
      action: 'repair_openclaw_runtime',
      failedAt: 'restart',
      error: restart.error,
    };
  }
  if ((restart.status ?? 0) !== 0) {
    return {
      ok: false,
      action: 'repair_openclaw_runtime',
      failedAt: 'restart',
      status: restart.status ?? 1,
    };
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));
  return {
    ok: true,
    action: 'repair_openclaw_runtime',
    command,
  };
}

export async function runHostedOnboardSelfHeal(plan, context = {}) {
  const steps = [];

  for (const action of plan.actions ?? []) {
    let result;
    if (action === 'normalize_skill_scripts') {
      result = await normalizeSkillScriptPermissions(context);
    } else if (action === 'ensure_hosted_state') {
      result = await ensureHostedState(context);
    } else if (action === 'repair_openclaw_runtime') {
      result = await repairOpenClawRuntime(context);
    } else {
      result = {
        ok: false,
        action,
        error: 'unknown self-heal action',
      };
    }

    steps.push(result);
    if (!result.ok) {
      return {
        ok: false,
        plan,
        steps,
        summary: `failed during ${action}`,
      };
    }
  }

  return {
    ok: true,
    plan,
    steps,
    summary: `completed ${steps.length} self-heal action(s)`,
  };
}
