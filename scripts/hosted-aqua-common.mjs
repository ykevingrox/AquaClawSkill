#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export const DEFAULT_WORKSPACE_ROOT = path.join(os.homedir(), '.openclaw', 'workspace');
export const DEFAULT_AQUACLAW_STATE_RELATIVE_DIR = '.aquaclaw';
export const DEFAULT_HOSTED_CONFIG_FILE_NAME = 'hosted-bridge.json';
export const DEFAULT_HOSTED_PULSE_STATE_FILE_NAME = 'hosted-pulse-state.json';
export const DEFAULT_HEARTBEAT_STATE_FILE_NAME = 'runtime-heartbeat-state.json';
export const DEFAULT_MIRROR_DIR_NAME = 'mirror';
export const DEFAULT_ACTIVE_PROFILE_FILE_NAME = 'active-profile.json';
export const ACTIVE_HOSTED_PROFILE_POINTER_VERSION = 1;
const DEFAULT_HOSTED_CONFIG_RELATIVE_PATH = path.join(
  DEFAULT_AQUACLAW_STATE_RELATIVE_DIR,
  DEFAULT_HOSTED_CONFIG_FILE_NAME,
);
const DEFAULT_HOSTED_PULSE_STATE_RELATIVE_PATH = path.join(
  DEFAULT_AQUACLAW_STATE_RELATIVE_DIR,
  DEFAULT_HOSTED_PULSE_STATE_FILE_NAME,
);
const DEFAULT_HEARTBEAT_STATE_RELATIVE_PATH = path.join(
  DEFAULT_AQUACLAW_STATE_RELATIVE_DIR,
  DEFAULT_HEARTBEAT_STATE_FILE_NAME,
);
const DEFAULT_MIRROR_RELATIVE_DIR = path.join(DEFAULT_AQUACLAW_STATE_RELATIVE_DIR, DEFAULT_MIRROR_DIR_NAME);
const DEFAULT_ACTIVE_PROFILE_RELATIVE_PATH = path.join(
  DEFAULT_AQUACLAW_STATE_RELATIVE_DIR,
  DEFAULT_ACTIVE_PROFILE_FILE_NAME,
);
const DEFAULT_PROFILES_RELATIVE_DIR = path.join(DEFAULT_AQUACLAW_STATE_RELATIVE_DIR, 'profiles');

export function parseArgValue(argv, index, current, label) {
  if (current.includes('=')) {
    return current.slice(current.indexOf('=') + 1);
  }

  const next = argv[index + 1];
  if (!next || next.startsWith('--')) {
    throw new Error(`${label} requires a value`);
  }

  return next;
}

export function normalizeBaseUrl(raw) {
  const url = new URL(String(raw).trim());
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function buildError(response, payload, fallbackMessage, request) {
  const error = new Error(payload?.error?.message ?? fallbackMessage);
  error.statusCode = response.status;
  error.code = payload?.error?.code ?? null;
  error.payload = payload;
  error.method = request.method;
  error.url = request.url;
  return error;
}

export async function requestJson(baseUrl, pathname, { method = 'GET', token, payload } = {}) {
  const url = pathname.startsWith('http://') || pathname.startsWith('https://')
    ? pathname
    : `${normalizeBaseUrl(baseUrl)}${pathname}`;
  let response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to reach AquaClaw at ${url}: ${message}`);
  }

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`invalid JSON response from ${url}`);
    }
  }

  if (!response.ok) {
    throw buildError(response, body, `request failed: ${response.status}`, { method, url });
  }

  return body;
}

export function resolveWorkspaceRoot(raw = process.env.OPENCLAW_WORKSPACE_ROOT) {
  const value = typeof raw === 'string' && raw.trim() ? raw.trim() : DEFAULT_WORKSPACE_ROOT;
  return path.resolve(value);
}

export function resolveAquaclawStateRoot(workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT) {
  return path.join(resolveWorkspaceRoot(workspaceRoot), DEFAULT_AQUACLAW_STATE_RELATIVE_DIR);
}

export function resolveActiveHostedProfilePath({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
} = {}) {
  return path.join(resolveWorkspaceRoot(workspaceRoot), DEFAULT_ACTIVE_PROFILE_RELATIVE_PATH);
}

export function resolveHostedProfilesRoot({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
} = {}) {
  return path.join(resolveWorkspaceRoot(workspaceRoot), DEFAULT_PROFILES_RELATIVE_DIR);
}

export function slugifySegment(value, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

export function buildHostedProfileId(baseUrl) {
  const host = new URL(normalizeBaseUrl(baseUrl)).host;
  return `hosted-${slugifySegment(host, 'hosted-default')}`;
}

export function resolveHostedProfilePaths({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
  profileId,
} = {}) {
  if (typeof profileId !== 'string' || !profileId.trim()) {
    throw new Error('profileId is required');
  }

  const resolvedWorkspaceRoot = resolveWorkspaceRoot(workspaceRoot);
  const resolvedProfileId = profileId.trim();
  const profileRoot = path.join(
    resolveHostedProfilesRoot({ workspaceRoot: resolvedWorkspaceRoot }),
    resolvedProfileId,
  );

  return {
    workspaceRoot: resolvedWorkspaceRoot,
    profileId: resolvedProfileId,
    profileRoot,
    configPath: path.join(profileRoot, DEFAULT_HOSTED_CONFIG_FILE_NAME),
    pulseStatePath: path.join(profileRoot, DEFAULT_HOSTED_PULSE_STATE_FILE_NAME),
    heartbeatStatePath: path.join(profileRoot, DEFAULT_HEARTBEAT_STATE_FILE_NAME),
    mirrorRoot: path.join(profileRoot, DEFAULT_MIRROR_DIR_NAME),
    activeProfilePath: resolveActiveHostedProfilePath({ workspaceRoot: resolvedWorkspaceRoot }),
  };
}

function readJsonFileSyncIfPresent(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    if (error instanceof SyntaxError) {
      throw new Error(`invalid JSON at ${filePath}`);
    }
    throw error;
  }
}

function normalizeActiveHostedProfilePointer(pointer, pointerPath) {
  if (!pointer || typeof pointer !== 'object') {
    throw new Error(`invalid active hosted profile pointer at ${pointerPath}`);
  }
  if (pointer.version !== ACTIVE_HOSTED_PROFILE_POINTER_VERSION) {
    throw new Error(`unsupported active hosted profile pointer version at ${pointerPath}`);
  }
  if (pointer.type !== 'hosted') {
    throw new Error(`invalid active hosted profile pointer type at ${pointerPath}`);
  }
  if (typeof pointer.profileId !== 'string' || !pointer.profileId.trim()) {
    throw new Error(`missing profileId in active hosted profile pointer at ${pointerPath}`);
  }

  return {
    version: ACTIVE_HOSTED_PROFILE_POINTER_VERSION,
    type: 'hosted',
    profileId: pointer.profileId.trim(),
    hubUrl: typeof pointer.hubUrl === 'string' && pointer.hubUrl.trim() ? pointer.hubUrl.trim() : null,
    configPath:
      typeof pointer.configPath === 'string' && pointer.configPath.trim() ? path.resolve(pointer.configPath) : null,
    updatedAt: typeof pointer.updatedAt === 'string' && pointer.updatedAt.trim() ? pointer.updatedAt.trim() : null,
  };
}

export function loadActiveHostedProfileSync({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
} = {}) {
  const pointerPath = resolveActiveHostedProfilePath({ workspaceRoot });
  const pointer = readJsonFileSyncIfPresent(pointerPath);
  if (pointer === null) {
    return {
      pointer: null,
      pointerPath,
    };
  }

  return {
    pointer: normalizeActiveHostedProfilePointer(pointer, pointerPath),
    pointerPath,
  };
}

export function parseHostedProfileIdFromConfigPath({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
  configPath,
} = {}) {
  if (typeof configPath !== 'string' || !configPath.trim()) {
    return null;
  }

  const resolvedConfigPath = path.resolve(configPath);
  const profilesRoot = resolveHostedProfilesRoot({ workspaceRoot });
  const relative = path.relative(profilesRoot, resolvedConfigPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  const parts = relative.split(path.sep).filter(Boolean);
  if (parts.length === 2 && parts[1] === DEFAULT_HOSTED_CONFIG_FILE_NAME) {
    return parts[0];
  }

  return null;
}

export function resolveHostedConfigSelection({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
  configPath = process.env.AQUACLAW_HOSTED_CONFIG,
} = {}) {
  const resolvedWorkspaceRoot = resolveWorkspaceRoot(workspaceRoot);
  const explicit = typeof configPath === 'string' && configPath.trim() ? path.resolve(configPath.trim()) : null;

  if (explicit) {
    const profileId = parseHostedProfileIdFromConfigPath({
      workspaceRoot: resolvedWorkspaceRoot,
      configPath: explicit,
    });
    const profilePaths = profileId
      ? resolveHostedProfilePaths({ workspaceRoot: resolvedWorkspaceRoot, profileId })
      : null;
    return {
      workspaceRoot: resolvedWorkspaceRoot,
      configPath: explicit,
      profileId,
      profileRoot: profilePaths?.profileRoot ?? null,
      selectionKind: 'explicit',
      activePointer: null,
      activeProfilePath: resolveActiveHostedProfilePath({ workspaceRoot: resolvedWorkspaceRoot }),
    };
  }

  const active = loadActiveHostedProfileSync({ workspaceRoot: resolvedWorkspaceRoot });
  if (active.pointer?.profileId) {
    const profilePaths = resolveHostedProfilePaths({
      workspaceRoot: resolvedWorkspaceRoot,
      profileId: active.pointer.profileId,
    });
    return {
      workspaceRoot: resolvedWorkspaceRoot,
      configPath: profilePaths.configPath,
      profileId: profilePaths.profileId,
      profileRoot: profilePaths.profileRoot,
      selectionKind: 'active-profile',
      activePointer: active.pointer,
      activeProfilePath: active.pointerPath,
    };
  }

  return {
    workspaceRoot: resolvedWorkspaceRoot,
    configPath: path.join(resolvedWorkspaceRoot, DEFAULT_HOSTED_CONFIG_RELATIVE_PATH),
    profileId: null,
    profileRoot: null,
    selectionKind: 'legacy',
    activePointer: active.pointer,
    activeProfilePath: active.pointerPath,
  };
}

export function resolveHostedConfigPath({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
  configPath = process.env.AQUACLAW_HOSTED_CONFIG,
} = {}) {
  return resolveHostedConfigSelection({
    workspaceRoot,
    configPath,
  }).configPath;
}

export function resolveHostedPulseStatePath({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
  stateFile = process.env.AQUACLAW_HOSTED_PULSE_STATE,
} = {}) {
  const explicit = typeof stateFile === 'string' && stateFile.trim() ? stateFile.trim() : null;
  if (explicit) {
    return path.resolve(explicit);
  }

  const selection = resolveHostedConfigSelection({
    workspaceRoot,
  });

  if (selection.profileId) {
    return resolveHostedProfilePaths({
      workspaceRoot: selection.workspaceRoot,
      profileId: selection.profileId,
    }).pulseStatePath;
  }

  return path.join(selection.workspaceRoot, DEFAULT_HOSTED_PULSE_STATE_RELATIVE_PATH);
}

export function resolveHeartbeatStatePath({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
  stateFile = process.env.AQUACLAW_HEARTBEAT_STATE_FILE,
  mode = 'auto',
} = {}) {
  const explicit = typeof stateFile === 'string' && stateFile.trim() ? stateFile.trim() : null;
  if (explicit) {
    return path.resolve(explicit);
  }

  const resolvedWorkspaceRoot = resolveWorkspaceRoot(workspaceRoot);
  if (mode === 'local') {
    return path.join(resolvedWorkspaceRoot, DEFAULT_HEARTBEAT_STATE_RELATIVE_PATH);
  }

  const selection = resolveHostedConfigSelection({
    workspaceRoot: resolvedWorkspaceRoot,
  });

  if (selection.profileId) {
    return resolveHostedProfilePaths({
      workspaceRoot: resolvedWorkspaceRoot,
      profileId: selection.profileId,
    }).heartbeatStatePath;
  }

  return path.join(resolvedWorkspaceRoot, DEFAULT_HEARTBEAT_STATE_RELATIVE_PATH);
}

export function resolveMirrorRootPath({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
  mirrorDir = process.env.AQUACLAW_MIRROR_DIR,
  mode = 'auto',
} = {}) {
  const explicit = typeof mirrorDir === 'string' && mirrorDir.trim() ? mirrorDir.trim() : null;
  if (explicit) {
    return path.resolve(explicit);
  }

  const resolvedWorkspaceRoot = resolveWorkspaceRoot(workspaceRoot);
  if (mode === 'local') {
    return path.join(resolvedWorkspaceRoot, DEFAULT_MIRROR_RELATIVE_DIR);
  }

  const selection = resolveHostedConfigSelection({
    workspaceRoot: resolvedWorkspaceRoot,
  });

  if (selection.profileId) {
    return resolveHostedProfilePaths({
      workspaceRoot: resolvedWorkspaceRoot,
      profileId: selection.profileId,
    }).mirrorRoot;
  }

  return path.join(resolvedWorkspaceRoot, DEFAULT_MIRROR_RELATIVE_DIR);
}

function assertHostedConfigShape(config, configPath) {
  if (!config || typeof config !== 'object') {
    throw new Error(`invalid hosted Aqua config at ${configPath}`);
  }
  if (config.version !== 1) {
    throw new Error(`unsupported hosted Aqua config version at ${configPath}`);
  }
  if (config.mode !== 'hosted') {
    throw new Error(`invalid hosted Aqua mode at ${configPath}`);
  }
  if (typeof config.hubUrl !== 'string' || !config.hubUrl.trim()) {
    throw new Error(`missing hubUrl in hosted Aqua config at ${configPath}`);
  }
  if (typeof config?.credential?.token !== 'string' || !config.credential.token.trim()) {
    throw new Error(`missing gateway token in hosted Aqua config at ${configPath}`);
  }
  if (typeof config?.runtime?.runtimeId !== 'string' || !config.runtime.runtimeId.trim()) {
    throw new Error(`missing runtimeId in hosted Aqua config at ${configPath}`);
  }
}

export async function loadHostedConfig({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
  configPath = process.env.AQUACLAW_HOSTED_CONFIG,
} = {}) {
  const selection = resolveHostedConfigSelection({
    workspaceRoot,
    configPath,
  });
  const resolvedWorkspaceRoot = selection.workspaceRoot;
  const resolvedConfigPath = selection.configPath;

  let raw;
  try {
    raw = await readFile(resolvedConfigPath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`hosted Aqua config not found at ${resolvedConfigPath}. Run aqua-hosted-join.sh first.`);
    }
    throw error;
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error(`invalid JSON in hosted Aqua config at ${resolvedConfigPath}`);
  }

  assertHostedConfigShape(config, resolvedConfigPath);

  return {
    config,
    configPath: resolvedConfigPath,
    workspaceRoot: resolvedWorkspaceRoot,
    profileId: selection.profileId ?? config?.profile?.id ?? null,
    profileRoot: selection.profileRoot ?? null,
    selectionKind: selection.selectionKind,
  };
}

export async function saveHostedConfig(configPath, config) {
  const directory = path.dirname(configPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const tempPath = `${configPath}.tmp-${process.pid}-${Date.now()}`;
  const payload = JSON.stringify(config, null, 2) + '\n';

  await writeFile(tempPath, payload, { mode: 0o600 });
  await rename(tempPath, configPath);
  try {
    await chmod(configPath, 0o600);
  } catch {}
}

async function saveJsonFileAtomically(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await rename(tempPath, filePath);
  try {
    await chmod(filePath, 0o600);
  } catch {}
}

export async function saveActiveHostedProfile({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
  profileId,
  hubUrl = null,
  configPath = null,
} = {}) {
  if (typeof profileId !== 'string' || !profileId.trim()) {
    throw new Error('profileId is required');
  }

  const pointerPath = resolveActiveHostedProfilePath({ workspaceRoot });
  const payload = {
    version: ACTIVE_HOSTED_PROFILE_POINTER_VERSION,
    type: 'hosted',
    profileId: profileId.trim(),
    hubUrl: typeof hubUrl === 'string' && hubUrl.trim() ? normalizeBaseUrl(hubUrl) : null,
    configPath: typeof configPath === 'string' && configPath.trim() ? path.resolve(configPath) : null,
    updatedAt: new Date().toISOString(),
  };

  await saveJsonFileAtomically(pointerPath, payload);

  return {
    pointerPath,
    payload,
  };
}

export async function clearActiveHostedProfile({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
} = {}) {
  const pointerPath = resolveActiveHostedProfilePath({ workspaceRoot });
  try {
    await unlink(pointerPath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        pointerPath,
        removed: false,
      };
    }
    throw error;
  }

  return {
    pointerPath,
    removed: true,
  };
}

export function buildHostedJoinDefaults() {
  const hostname = os.hostname() || 'host';
  const hostSlug = slugifySegment(hostname, 'host');
  const suffix = randomBytes(3).toString('hex');
  const runtimeSlug = `${hostSlug}-${suffix}`;

  return {
    displayName: `OpenClaw @ ${hostname}`,
    handle: `claw-${runtimeSlug}`,
    installationId: `openclaw-${hostSlug}`,
    runtimeId: `openclaw-${runtimeSlug}`,
    label: `OpenClaw @ ${hostname}`,
    source: 'openclaw_skill_hosted',
  };
}

export function formatTimestamp(value) {
  if (!value) {
    return 'n/a';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

export function parsePositiveInt(value, label) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}
