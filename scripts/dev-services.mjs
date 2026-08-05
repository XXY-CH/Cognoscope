#!/usr/bin/env node
/**
 * Cross-platform lifecycle manager for the Xuesen development services.
 * It owns only processes recorded in .xuesen-runtime/state.json.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const RUNTIME_DIR = path.join(ROOT_DIR, '.xuesen-runtime');
const LOG_DIR = path.join(RUNTIME_DIR, 'logs');
const STATE_PATH = path.join(RUNTIME_DIR, 'state.json');
const HOST = '127.0.0.1';
const PORTS = { frontend: 5173, api: 8000, monitor: 8765 };

function ensureRuntimeDirs() {
  mkdirSync(LOG_DIR, { recursive: true });
}

function readState() {
  if (!existsSync(STATE_PATH)) return { version: 1, services: {} };
  try {
    const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    return state && typeof state === 'object' ? state : { version: 1, services: {} };
  } catch {
    return { version: 1, services: {} };
  }
}

function writeState(state) {
  ensureRuntimeDirs();
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (process.platform !== 'win32') {
    const processState = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).stdout.trim();
    if (!processState || processState.startsWith('Z')) return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function commandWorks(command, args = []) {
  const result = spawnSync(command, [...args, '--version'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  return result.status === 0;
}

function resolvePython(kind) {
  const relativeVenv = kind === 'api'
    ? ['backend', 'venv']
    : ['monitor', 'venv'];
  const venvPython = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
  const localPython = path.join(ROOT_DIR, ...relativeVenv, ...venvPython.split('/'));
  if (existsSync(localPython)) return { command: localPython, prefixArgs: [] };

  const candidates = process.platform === 'win32'
    ? [
        { command: 'py', prefixArgs: ['-3'] },
        { command: 'python', prefixArgs: [] },
      ]
    : [
        { command: 'python3', prefixArgs: [] },
        { command: 'python', prefixArgs: [] },
      ];
  return candidates.find(({ command, prefixArgs }) => commandWorks(command, prefixArgs)) ?? null;
}

function monitorPrerequisiteMessage() {
  const requiredModels = [
    'monitor/models/face_landmarker.task',
    'monitor/models/pose_landmarker.task',
  ];
  const missing = requiredModels.filter((relativePath) => !existsSync(path.join(ROOT_DIR, relativePath)));
  return missing.length > 0
    ? `monitor model file(s) missing: ${missing.join(', ')}; see monitor/README.md`
    : null;
}

function resolveNpm() {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return commandWorks(command) ? command : null;
}

function serviceSpecs(options) {
  const npm = resolveNpm();
  const apiPython = resolvePython('api');
  const monitorPython = resolvePython('monitor');
  const specs = [];

  if (npm) {
    specs.push({
      id: 'frontend',
      label: 'Vite frontend',
      command: npm,
      args: ['run', 'dev', '--', '--host', HOST, '--port', String(PORTS.frontend), '--strictPort'],
      cwd: ROOT_DIR,
      port: PORTS.frontend,
    });
  } else {
    specs.push({ id: 'frontend', label: 'Vite frontend', missing: 'npm was not found on PATH' });
  }

  if (!options.skipApi) {
    if (apiPython) {
      specs.push({
        id: 'api',
        label: 'FastAPI backend',
        command: apiPython.command,
        args: [...apiPython.prefixArgs, '-m', 'uvicorn', 'cognoscope.api.main:app', '--host', HOST, '--port', String(PORTS.api)],
        cwd: path.join(ROOT_DIR, 'backend'),
        port: PORTS.api,
      });
    } else {
      specs.push({ id: 'api', label: 'FastAPI backend', missing: 'Python 3 was not found and backend/venv is unavailable' });
    }
  }

  if (!options.skipMonitor) {
    const monitorPrerequisiteError = monitorPython ? monitorPrerequisiteMessage() : null;
    if (monitorPython && !monitorPrerequisiteError) {
      specs.push({
        id: 'monitor',
        label: 'Reading monitor',
        command: monitorPython.command,
        args: [...monitorPython.prefixArgs, 'monitor/server.py', '--host', HOST, '--port', String(PORTS.monitor)],
        cwd: ROOT_DIR,
        port: PORTS.monitor,
      });
    } else {
      specs.push({
        id: 'monitor',
        label: 'Reading monitor',
        missing: monitorPrerequisiteError ?? 'Python 3 was not found and monitor/venv is unavailable',
      });
    }
  }

  return specs;
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: HOST, port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(350, () => finish(false));
  });
}

function commandLabel(spec) {
  return [spec.command, ...spec.args].join(' ');
}

function logPathFor(id) {
  return path.join(LOG_DIR, `${id}.log`);
}

async function start(options) {
  ensureRuntimeDirs();
  const oldState = readState();
  const nextServices = {};
  let failures = 0;

  for (const spec of serviceSpecs(options)) {
    const previous = oldState.services?.[spec.id];
    if (previous && isAlive(previous.pid)) {
      nextServices[spec.id] = previous;
      console.log(`[running] ${spec.label} (pid ${previous.pid})`);
      continue;
    }

    if (spec.missing) {
      console.error(`[failed] ${spec.label}: ${spec.missing}`);
      failures += 1;
      continue;
    }

    if (await portInUse(spec.port)) {
      console.warn(`[skip] ${spec.label}: port ${spec.port} is already in use; existing process was not touched`);
      continue;
    }

    const logPath = logPathFor(spec.id);
    const logFd = openSync(logPath, 'a');
    try {
      const child = spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        detached: true,
        stdio: ['ignore', logFd, logFd],
        windowsHide: false,
      });
      child.unref();
      nextServices[spec.id] = {
        pid: child.pid,
        port: spec.port,
        logPath,
        command: commandLabel(spec),
        startedAt: new Date().toISOString(),
      };
      console.log(`[started] ${spec.label} (pid ${child.pid}, port ${spec.port})`);
      console.log(`         log: ${path.relative(ROOT_DIR, logPath)}`);
    } catch (error) {
      console.error(`[failed] ${spec.label}: ${error.message}`);
      failures += 1;
    } finally {
      closeSync(logFd);
    }
  }

  // Catch import/configuration failures that exit immediately after spawn.
  await delay(300);
  for (const [id, service] of Object.entries(nextServices)) {
    if (isAlive(service.pid)) continue;
    delete nextServices[id];
    failures += 1;
    console.error(`[failed] ${id} exited during startup; see ${path.relative(ROOT_DIR, service.logPath)}`);
  }

  writeState({ version: 1, services: nextServices });
  console.log(`\nFrontend: http://${HOST}:${PORTS.frontend}/`);
  console.log(`Backend:  http://${HOST}:${PORTS.api}/docs`);
  console.log(`Monitor:  http://${HOST}:${PORTS.monitor}/api/health`);
  console.log('Use the matching stop script to terminate only services started by this command.');
  process.exitCode = failures > 0 ? 1 : 0;
}

async function stopPid(pid) {
  if (!isAlive(pid)) return false;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch {
      return false;
    }
    return true;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return false;
    }
  }
  return true;
}

async function waitUntilStopped(pids, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && pids.some(isAlive)) {
    await delay(100);
  }
  return pids.filter(isAlive);
}

async function stop() {
  const state = readState();
  const services = Object.entries(state.services ?? {})
    .filter(([, service]) => Number.isInteger(service.pid));
  if (services.length === 0) {
    console.log('[stopped] no services owned by this workspace were found');
    return;
  }

  // Ask monitor to release the camera before terminating its process tree.
  if (services.some(([id]) => id === 'monitor')) {
    try {
      await fetch(`http://${HOST}:${PORTS.monitor}/api/detect/stop`, { method: 'POST', signal: AbortSignal.timeout(1000) });
    } catch {
      // The process termination below is still authoritative.
    }
  }

  const pids = services.map(([, service]) => service.pid);
  for (const [id, service] of services) {
    if (await stopPid(service.pid)) console.log(`[stopping] ${id} (pid ${service.pid})`);
  }
  const remaining = await waitUntilStopped(pids);
  if (remaining.length > 0 && process.platform !== 'win32') {
    for (const pid of remaining) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
      }
    }
  }
  rmSync(STATE_PATH, { force: true });
  console.log(remaining.length === 0 ? '[stopped] all owned services' : `[warning] ${remaining.length} process(es) may still be running`);
}

async function status() {
  const state = readState();
  const entries = Object.entries(state.services ?? {});
  if (entries.length === 0) {
    console.log('No services are owned by this workspace.');
    return;
  }
  for (const [id, service] of entries) {
    console.log(`${id}: ${isAlive(service.pid) ? 'running' : 'stale'} (pid ${service.pid}, port ${service.port})`);
  }
}

const action = process.argv[2] ?? 'start';
const flags = new Set(process.argv.slice(3));
const options = {
  skipApi: flags.has('--skip-api') || process.env.XUESEN_SKIP_API === '1',
  skipMonitor: flags.has('--skip-monitor') || process.env.XUESEN_SKIP_MONITOR === '1',
};

if (action === 'start') await start(options);
else if (action === 'stop') await stop();
else if (action === 'status') await status();
else {
  console.error('Usage: node scripts/dev-services.mjs <start|stop|status> [--skip-api] [--skip-monitor]');
  process.exitCode = 2;
}
