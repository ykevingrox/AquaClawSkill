#!/usr/bin/env node

import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import {
  buildStoredDeliveryRecord,
  conversationFilePath,
  createDefaultMirrorState,
  datePartitionFromIso,
  extractDeliveryHints,
  parseSseEventBlock,
  publicThreadFilePath,
  pushRecentDelivery,
  relativeMirrorPath,
  resolveMirrorPaths,
  loadMirrorState,
  saveMirrorState,
  writeJsonFile,
  appendNdjson,
} from './aqua-mirror-common.mjs';
import {
  loadHostedConfig,
  normalizeBaseUrl,
  parseArgValue,
  parsePositiveInt,
  requestJson,
  resolveHostedConfigPath,
  resolveWorkspaceRoot,
} from './hosted-aqua-common.mjs';

const DEFAULT_LOCAL_HUB_URL = 'http://127.0.0.1:8787';
const DEFAULT_IDLE_SECONDS = 5;
const DEFAULT_RECONNECT_SECONDS = 5;
const DEFAULT_PUBLIC_THREAD_LIMIT = 20;
const VALID_MODES = new Set(['auto', 'hosted', 'local']);

function printHelp() {
  console.log(`Usage: aqua-mirror-sync.mjs [options]

Options:
  --mode <mode>                  auto|hosted|local (default: auto)
  --workspace-root <path>        OpenClaw workspace root
  --config-path <path>           Hosted Aqua config path
  --hub-url <url>                Local Aqua hub base URL (default: ${DEFAULT_LOCAL_HUB_URL})
  --mirror-dir <path>            Mirror root directory
  --state-file <path>            Mirror state file override
  --once                         Sync once, then exit after the stream goes idle
  --follow                       Keep the stream open and reconnect on failure
  --idle-seconds <n>             Idle timeout for --once (default: ${DEFAULT_IDLE_SECONDS})
  --reconnect-seconds <n>        Reconnect delay for --follow (default: ${DEFAULT_RECONNECT_SECONDS})
  --hydrate-conversations        Fetch all visible DM threads at startup and on resync
  --hydrate-public-threads       Fetch recent public threads at startup and on resync
  --public-thread-limit <n>      Recent public-expression list size for hydration (default: ${DEFAULT_PUBLIC_THREAD_LIMIT})
  --reset-cursor                 Ignore the stored stream cursor and start from "now"
  --help                         Show this message

Defaults:
  If neither --once nor --follow is given, the command behaves like --once.

What this command mirrors:
  - a local append-only sea-event delivery log under .aquaclaw/mirror/sea-events/
  - a current context snapshot under .aquaclaw/mirror/context/latest.json
  - hosted participant DM summaries/threads under .aquaclaw/mirror/conversations/
  - hosted participant public threads under .aquaclaw/mirror/public-threads/
`);
}

function parseOptions(argv) {
  const options = {
    configPath: process.env.AQUACLAW_HOSTED_CONFIG || null,
    follow: false,
    hostedConfigPath: null,
    hubUrl: process.env.AQUACLAW_HUB_URL || DEFAULT_LOCAL_HUB_URL,
    hydrateConversations: false,
    hydratePublicThreads: false,
    idleSeconds: DEFAULT_IDLE_SECONDS,
    mirrorDir: process.env.AQUACLAW_MIRROR_DIR || null,
    mode: 'auto',
    once: false,
    publicThreadLimit: DEFAULT_PUBLIC_THREAD_LIMIT,
    reconnectSeconds: DEFAULT_RECONNECT_SECONDS,
    resetCursor: false,
    stateFile: process.env.AQUACLAW_MIRROR_STATE_FILE || null,
    workspaceRoot: process.env.OPENCLAW_WORKSPACE_ROOT || null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--once') {
      options.once = true;
      continue;
    }
    if (arg === '--follow') {
      options.follow = true;
      continue;
    }
    if (arg === '--hydrate-conversations') {
      options.hydrateConversations = true;
      continue;
    }
    if (arg === '--hydrate-public-threads') {
      options.hydratePublicThreads = true;
      continue;
    }
    if (arg === '--reset-cursor') {
      options.resetCursor = true;
      continue;
    }
    if (arg.startsWith('--mode')) {
      options.mode = parseArgValue(argv, index, arg, '--mode').trim().toLowerCase();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--workspace-root')) {
      options.workspaceRoot = parseArgValue(argv, index, arg, '--workspace-root').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--config-path')) {
      options.configPath = parseArgValue(argv, index, arg, '--config-path').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--hub-url')) {
      options.hubUrl = parseArgValue(argv, index, arg, '--hub-url').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--mirror-dir')) {
      options.mirrorDir = parseArgValue(argv, index, arg, '--mirror-dir').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--state-file')) {
      options.stateFile = parseArgValue(argv, index, arg, '--state-file').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--idle-seconds')) {
      options.idleSeconds = parsePositiveInt(parseArgValue(argv, index, arg, '--idle-seconds'), '--idle-seconds');
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--reconnect-seconds')) {
      options.reconnectSeconds = parsePositiveInt(
        parseArgValue(argv, index, arg, '--reconnect-seconds'),
        '--reconnect-seconds',
      );
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--public-thread-limit')) {
      options.publicThreadLimit = parsePositiveInt(
        parseArgValue(argv, index, arg, '--public-thread-limit'),
        '--public-thread-limit',
      );
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }

    throw new Error(`unknown option: ${arg}`);
  }

  if (!VALID_MODES.has(options.mode)) {
    throw new Error('--mode must be one of: auto, hosted, local');
  }
  if (options.once && options.follow) {
    throw new Error('use either --once or --follow, not both');
  }
  if (!options.once && !options.follow) {
    options.once = true;
  }
  if (!options.stateFile && !options.mirrorDir && !options.workspaceRoot) {
    options.workspaceRoot = resolveWorkspaceRoot();
  }
  options.hubUrl = normalizeBaseUrl(options.hubUrl || DEFAULT_LOCAL_HUB_URL);
  return options;
}

function log(level, message, extra = null) {
  const prefix = `[${new Date().toISOString()}] [aqua-mirror-sync] [${level}]`;
  if (extra === null) {
    console.log(`${prefix} ${message}`);
    return;
  }
  console.log(`${prefix} ${message} ${JSON.stringify(extra)}`);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveMode(options) {
  if (options.mode !== 'auto') {
    return options.mode;
  }

  const hostedConfigPath = resolveHostedConfigPath({
    workspaceRoot: options.workspaceRoot,
    configPath: options.configPath || undefined,
  });
  return (await fileExists(hostedConfigPath)) ? 'hosted' : 'local';
}

function buildUnauthorizedStreamError(response, body) {
  const detail = body?.error?.message ?? `stream request failed with HTTP ${response.status}`;
  return new Error(detail);
}

async function createHostedTarget(options) {
  const loaded = await loadHostedConfig({
    workspaceRoot: options.workspaceRoot,
    configPath: options.configPath || undefined,
  });

  return {
    mode: 'hosted',
    hubUrl: loaded.config.hubUrl,
    token: loaded.config.credential.token,
    viewerKind: 'gateway',
    workspaceRoot: loaded.workspaceRoot,
    configPath: loaded.configPath,
    async readContextBase() {
      const [health, aqua, gateway, environment, current] = await Promise.all([
        requestJson(loaded.config.hubUrl, '/health'),
        requestJson(loaded.config.hubUrl, '/api/v1/public/aqua'),
        requestJson(loaded.config.hubUrl, '/api/v1/gateways/me', { token: loaded.config.credential.token }),
        requestJson(loaded.config.hubUrl, '/api/v1/environment/current', { token: loaded.config.credential.token }),
        requestJson(loaded.config.hubUrl, '/api/v1/currents/current'),
      ]);

      let runtime;
      try {
        const runtimePayload = await requestJson(loaded.config.hubUrl, '/api/v1/runtime/remote/me', {
          token: loaded.config.credential.token,
        });
        runtime = {
          bound: true,
          ...runtimePayload.data,
        };
      } catch (error) {
        if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
          runtime = {
            bound: false,
            reason: error.message,
          };
        } else {
          throw error;
        }
      }

      return {
        health: health?.data ?? null,
        aqua: aqua?.data?.aqua ?? null,
        gateway: gateway?.data?.gateway ?? null,
        environment: environment?.data?.environment ?? null,
        current: current?.data?.current ?? null,
        runtime,
      };
    },
    async fetchConversations() {
      return requestJson(loaded.config.hubUrl, '/api/v1/conversations', {
        token: loaded.config.credential.token,
      });
    },
    async fetchConversationThread(conversationId) {
      return requestJson(loaded.config.hubUrl, `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
        token: loaded.config.credential.token,
      });
    },
    async fetchPublicThread(rootExpressionId) {
      const query = new URLSearchParams();
      query.set('rootExpressionId', rootExpressionId);
      return requestJson(loaded.config.hubUrl, `/api/v1/public-expressions?${query.toString()}`, {
        token: loaded.config.credential.token,
      });
    },
    async fetchRecentPublicExpressions(limit) {
      const query = new URLSearchParams();
      query.set('limit', String(limit));
      query.set('includeReplies', 'true');
      return requestJson(loaded.config.hubUrl, `/api/v1/public-expressions?${query.toString()}`, {
        token: loaded.config.credential.token,
      });
    },
  };
}

async function createLocalTarget(options) {
  const hubUrl = normalizeBaseUrl(options.hubUrl || DEFAULT_LOCAL_HUB_URL);
  const bootstrap = await requestJson(hubUrl, '/api/v1/session/bootstrap-local', {
    method: 'POST',
  });
  const token = bootstrap?.data?.credential?.token;
  if (!token) {
    throw new Error('bootstrap-local did not return a local session token');
  }

  return {
    mode: 'local',
    hubUrl,
    token,
    viewerKind: 'host',
    workspaceRoot: resolveWorkspaceRoot(options.workspaceRoot),
    async readContextBase() {
      const [health, session, aqua, environment, current] = await Promise.all([
        requestJson(hubUrl, '/health'),
        requestJson(hubUrl, '/api/v1/session/me', { token }),
        requestJson(hubUrl, '/api/v1/public/aqua'),
        requestJson(hubUrl, '/api/v1/environment/current', { token }),
        requestJson(hubUrl, '/api/v1/currents/current'),
      ]);

      let runtime;
      try {
        const runtimePayload = await requestJson(hubUrl, '/api/v1/runtime/local', { token });
        runtime = {
          bound: true,
          ...runtimePayload.data,
        };
      } catch (error) {
        if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
          runtime = {
            bound: false,
            reason: error.message,
          };
        } else {
          throw error;
        }
      }

      return {
        health: health?.data ?? null,
        session: session?.data ?? bootstrap?.data ?? null,
        aqua: aqua?.data?.aqua ?? null,
        environment: environment?.data?.environment ?? null,
        current: current?.data?.current ?? null,
        runtime,
      };
    },
  };
}

async function createTarget(options) {
  const mode = await resolveMode(options);
  if (mode === 'hosted') {
    return createHostedTarget(options);
  }
  return createLocalTarget(options);
}

async function openSeaStream(target, lastEventId) {
  const headers = {
    accept: 'text/event-stream',
    authorization: `Bearer ${target.token}`,
  };
  if (lastEventId) {
    headers['last-event-id'] = lastEventId;
  }

  const response = await fetch(`${target.hubUrl}/api/v1/stream/sea`, {
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    throw buildUnauthorizedStreamError(response, body);
  }

  if (!response.body) {
    throw new Error('stream response did not include a body');
  }

  return {
    response,
    reader: response.body.getReader(),
  };
}

async function persistContextSnapshot(target, paths, state) {
  const base = await target.readContextBase();
  const generatedAt = new Date().toISOString();

  let snapshot;
  if (target.mode === 'hosted') {
    snapshot = {
      version: 1,
      generatedAt,
      mode: target.mode,
      hub: {
        url: target.hubUrl,
        status: base.health?.status ?? 'unknown',
        deploymentMode: base.health?.deploymentMode ?? target.mode,
      },
      gateway: base.gateway,
      aqua: base.aqua,
      runtime: base.runtime,
      environment: base.environment,
      current: base.current,
      recentDeliveries: state.recentDeliveries,
    };

    state.viewer = {
      kind: 'gateway',
      id: base.gateway?.id ?? null,
      handle: base.gateway?.handle ?? null,
      displayName: base.gateway?.displayName ?? null,
    };
  } else {
    snapshot = {
      version: 1,
      generatedAt,
      mode: target.mode,
      hub: {
        url: target.hubUrl,
        status: base.health?.status ?? 'unknown',
        deploymentMode: base.health?.deploymentMode ?? target.mode,
      },
      owner: base.session,
      aqua: base.aqua,
      runtime: base.runtime,
      environment: base.environment,
      current: base.current,
      recentDeliveries: state.recentDeliveries,
    };

    state.viewer = {
      kind: 'host',
      id: base.session?.host?.id ?? null,
      handle: base.session?.host?.handle ?? null,
      displayName: base.session?.host?.displayName ?? null,
    };
  }

  await writeJsonFile(paths.contextPath, snapshot);
  state.mode = target.mode;
  state.hubUrl = target.hubUrl;
  state.mirror.lastContextSyncAt = generatedAt;
}

async function syncConversationIndex(target, paths, state) {
  if (target.viewerKind !== 'gateway') {
    return;
  }

  const payload = await target.fetchConversations();
  const generatedAt = new Date().toISOString();
  const items = payload?.data?.items ?? [];
  const record = {
    version: 1,
    generatedAt,
    hubUrl: target.hubUrl,
    mode: target.mode,
    items,
    nextCursor: payload?.data?.nextCursor ?? null,
  };

  await writeJsonFile(paths.conversationIndexPath, record);
  state.conversations.items = items.map((item) => ({
    id: item.id,
    updatedAt: item.updatedAt,
    peer: item.peer,
    readState: item.readState,
  }));
  state.mirror.lastConversationIndexSyncAt = generatedAt;
}

async function syncConversationThread(target, paths, state, conversationId) {
  if (target.viewerKind !== 'gateway') {
    return;
  }

  const payload = await target.fetchConversationThread(conversationId);
  const generatedAt = new Date().toISOString();
  const filePath = conversationFilePath(paths, conversationId);
  const summary = state.conversations.items.find((item) => item.id === conversationId) ?? null;
  const messages = payload?.data?.items ?? [];
  const readState = payload?.data?.readState ?? null;

  await writeJsonFile(filePath, {
    version: 1,
    generatedAt,
    hubUrl: target.hubUrl,
    mode: target.mode,
    conversation: summary,
    items: messages,
    readState,
  });

  state.conversations.byId[conversationId] = {
    syncedAt: generatedAt,
    file: relativeMirrorPath(paths, filePath),
    messageCount: messages.length,
    lastMessageId: readState?.latestMessageId ?? messages.at(-1)?.id ?? null,
  };
  state.mirror.lastConversationThreadSyncAt = generatedAt;
}

async function syncPublicThread(target, paths, state, rootExpressionId) {
  if (target.viewerKind !== 'gateway') {
    return;
  }

  const payload = await target.fetchPublicThread(rootExpressionId);
  const generatedAt = new Date().toISOString();
  const items = payload?.data?.items ?? [];
  const filePath = publicThreadFilePath(paths, rootExpressionId);

  await writeJsonFile(filePath, {
    version: 1,
    generatedAt,
    hubUrl: target.hubUrl,
    mode: target.mode,
    rootExpressionId,
    items,
    nextCursor: payload?.data?.nextCursor ?? null,
  });

  state.publicThreads.byRootId[rootExpressionId] = {
    syncedAt: generatedAt,
    file: relativeMirrorPath(paths, filePath),
    expressionCount: items.length,
    lastExpressionId: items.at(-1)?.id ?? null,
  };
  state.mirror.lastPublicThreadSyncAt = generatedAt;
}

async function hydratePublicThreads(target, paths, state, limit) {
  if (target.viewerKind !== 'gateway') {
    return;
  }

  const payload = await target.fetchRecentPublicExpressions(limit);
  const items = payload?.data?.items ?? [];
  const rootIds = Array.from(
    new Set(
      items
        .map((item) => item.rootExpressionId ?? item.id ?? null)
        .filter((value) => typeof value === 'string' && value.trim()),
    ),
  );

  for (const rootExpressionId of rootIds) {
    await syncPublicThread(target, paths, state, rootExpressionId);
  }
}

async function hydrateConversationThreads(target, paths, state) {
  if (target.viewerKind !== 'gateway') {
    return;
  }

  await syncConversationIndex(target, paths, state);
  for (const item of state.conversations.items) {
    await syncConversationThread(target, paths, state, item.id);
  }
}

async function withWarning(label, fn) {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('warn', label, { error: message });
  }
}

async function mirrorDelivery(target, paths, state, delivery) {
  const recordedAt = new Date().toISOString();
  const storedRecord = buildStoredDeliveryRecord(delivery, recordedAt);
  const partition = datePartitionFromIso(delivery?.seaEvent?.createdAt ?? recordedAt);
  const seaLogPath = path.join(paths.seaEventsDir, `${partition}.ndjson`);

  await appendNdjson(seaLogPath, storedRecord);

  state.recentDeliveries = pushRecentDelivery(state.recentDeliveries, storedRecord);
  state.stream.lastDeliveryId = delivery?.id ?? state.stream.lastDeliveryId;
  state.stream.lastSeaEventId = delivery?.seaEvent?.id ?? state.stream.lastSeaEventId;
  state.stream.lastEventAt = recordedAt;

  const hints = extractDeliveryHints(delivery);

  if (hints.refreshContext) {
    await withWarning('context refresh failed after sea event', async () => {
      await persistContextSnapshot(target, paths, state);
    });
  }

  if (target.viewerKind !== 'gateway') {
    return;
  }

  if (hints.refreshConversationIndex || hints.conversationUpdates.length > 0) {
    await withWarning('conversation index sync failed', async () => {
      await syncConversationIndex(target, paths, state);
    });
  }

  for (const update of hints.conversationUpdates) {
    const stored = state.conversations.byId[update.conversationId];
    if (stored?.lastMessageId && update.messageId && stored.lastMessageId === update.messageId) {
      continue;
    }

    await withWarning(`conversation thread sync failed for ${update.conversationId}`, async () => {
      await syncConversationThread(target, paths, state, update.conversationId);
    });
  }

  for (const update of hints.publicThreadUpdates) {
    const stored = state.publicThreads.byRootId[update.rootExpressionId];
    if (stored?.lastExpressionId && update.expressionId && stored.lastExpressionId === update.expressionId) {
      continue;
    }

    await withWarning(`public thread sync failed for ${update.rootExpressionId}`, async () => {
      await syncPublicThread(target, paths, state, update.rootExpressionId);
    });
  }
}

async function handleStreamFrame(target, paths, state, options, frame) {
  const now = new Date().toISOString();

  if (frame.event === 'hello') {
    state.stream.lastHelloAt = now;
    state.stream.lastError = null;
    const cursor = frame?.data?.cursor;
    if (!state.stream.lastDeliveryId && typeof cursor === 'string' && cursor.trim()) {
      state.stream.lastDeliveryId = cursor.trim();
    }
    await saveMirrorState(paths.statePath, state);
    log('info', 'stream connected', {
      mode: target.mode,
      viewer: frame?.data?.viewerGatewayId ?? state.viewer.id,
      replayedCount: frame?.data?.replayedCount ?? 0,
      cursor: frame?.data?.cursor ?? null,
    });
    return;
  }

  if (frame.event === 'ping') {
    return;
  }

  if (frame.event === 'resync_required') {
    state.stream.lastResyncRequiredAt = now;
    state.stream.lastRejectedCursor = frame?.data?.cursor ?? null;
    state.stream.resyncCount += 1;
    await withWarning('context refresh failed after resync_required', async () => {
      await persistContextSnapshot(target, paths, state);
    });
    if (target.viewerKind === 'gateway') {
      await withWarning('conversation index sync failed after resync_required', async () => {
        await syncConversationIndex(target, paths, state);
      });
      if (options.hydrateConversations) {
        await withWarning('conversation hydration failed after resync_required', async () => {
          await hydrateConversationThreads(target, paths, state);
        });
      }
      if (options.hydratePublicThreads) {
        await withWarning('public-thread hydration failed after resync_required', async () => {
          await hydratePublicThreads(target, paths, state, options.publicThreadLimit);
        });
      }
    }
    await saveMirrorState(paths.statePath, state);
    log('warn', 'stream requested resync', frame.data ?? null);
    return;
  }

  if (frame.event === 'sea.invalidate') {
    await mirrorDelivery(target, paths, state, frame.data);
    await saveMirrorState(paths.statePath, state);
    log('info', 'mirrored sea delivery', {
      deliveryId: frame.id ?? frame?.data?.id ?? null,
      type: frame?.data?.seaEvent?.type ?? 'unknown',
    });
  }
}

async function consumeStream(target, paths, state, options) {
  const stream = await openSeaStream(target, options.resetCursor ? null : state.stream.lastDeliveryId);
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const readPromise = stream.reader.read();
      const result = options.follow
        ? await readPromise
        : await Promise.race([
            readPromise,
            delay(options.idleSeconds * 1_000, { idle: true }),
          ]);

      if (result && typeof result === 'object' && 'idle' in result && result.idle === true) {
        await stream.reader.cancel('idle');
        log('info', 'stream idle timeout reached; stopping once run', {
          idleSeconds: options.idleSeconds,
        });
        return;
      }

      if (result.done) {
        throw new Error('sea stream closed');
      }

      buffer += decoder.decode(result.value, { stream: true });
      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex >= 0) {
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const frame = parseSseEventBlock(block);
        if (frame) {
          await handleStreamFrame(target, paths, state, options, frame);
        }
        separatorIndex = buffer.indexOf('\n\n');
      }
    }
  } finally {
    stream.reader.releaseLock();
  }
}

async function run(options) {
  const target = await createTarget(options);
  const paths = resolveMirrorPaths({
    workspaceRoot: target.workspaceRoot,
    mirrorDir: options.mirrorDir,
    stateFile: options.stateFile,
  });
  const state = await loadMirrorState(paths.statePath);
  if (state.version !== 1) {
    throw new Error('unsupported mirror state version');
  }
  if (options.resetCursor) {
    state.stream.lastDeliveryId = null;
  }

  log('info', 'starting mirror sync', {
    mode: target.mode,
    hubUrl: target.hubUrl,
    mirrorRoot: paths.mirrorRoot,
    viewerKind: target.viewerKind,
    follow: options.follow,
  });

  await persistContextSnapshot(target, paths, state);
  if (target.viewerKind === 'gateway') {
    await syncConversationIndex(target, paths, state);
    if (options.hydrateConversations) {
      await hydrateConversationThreads(target, paths, state);
    }
    if (options.hydratePublicThreads) {
      await hydratePublicThreads(target, paths, state, options.publicThreadLimit);
    }
  } else if (options.hydrateConversations || options.hydratePublicThreads) {
    log('warn', 'conversation/public-thread hydration is only available for gateway-scoped mirrors');
  }

  await saveMirrorState(paths.statePath, state);

  if (!options.follow) {
    await consumeStream(target, paths, state, options);
    return {
      mode: target.mode,
      hubUrl: target.hubUrl,
      mirrorRoot: paths.mirrorRoot,
      lastDeliveryId: state.stream.lastDeliveryId,
      recentDeliveries: state.recentDeliveries.length,
      conversationThreads: Object.keys(state.conversations.byId).length,
      publicThreads: Object.keys(state.publicThreads.byRootId).length,
    };
  }

  while (true) {
    try {
      await consumeStream(target, paths, state, options);
      state.stream.reconnectCount += 1;
      await saveMirrorState(paths.statePath, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.stream.lastError = {
        at: new Date().toISOString(),
        message,
      };
      state.stream.reconnectCount += 1;
      await saveMirrorState(paths.statePath, state);
      log('warn', 'stream disconnected; reconnecting after delay', {
        error: message,
        reconnectSeconds: options.reconnectSeconds,
      });
      await delay(options.reconnectSeconds * 1_000);
    }
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const summary = await run(options);
  if (summary) {
    log('info', 'mirror sync finished', summary);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
