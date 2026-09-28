/**
 * C++ judge.
 *
 * Submitted code NEVER runs inside the Node.js process. It is compiled and executed as a
 * separate child process (spawn with an argument array — no shell) in a throw-away
 * directory, with:
 *   - wall-clock timeout (SIGKILL) and CPU-time limit
 *   - address-space (memory), file-size, open-file and core-dump limits via `prlimit`
 *   - no network via a Linux network namespace (`unshare -n`) when available
 *   - an empty environment, stdout/stderr size caps, and a global concurrency limit
 *
 * CODE_RUNNER=docker additionally isolates the filesystem, PIDs and capabilities inside a
 * disposable container. The "process" runner is a best-effort local-development sandbox,
 * NOT a security boundary suitable for untrusted multi-tenant production use; see README.
 */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 8 * 1024;
const COMPILE_TIMEOUT_MS = 30000;
const MAX_CONCURRENT = 2;

// ------------------------------------------------------------------ capability detection
function commandWorks(cmd, args) {
  try {
    return spawnSync(cmd, args, { stdio: 'ignore', timeout: 5000 }).status === 0;
  } catch {
    return false;
  }
}

let capabilities;
function detectCapabilities() {
  if (capabilities) return capabilities;
  const linux = process.platform === 'linux';
  capabilities = {
    gpp: commandWorks('g++', ['--version']),
    prlimit: linux && commandWorks('prlimit', ['--version']),
    // Prefer an unprivileged user namespace; fall back to a plain netns when running as root.
    unshare: linux
      ? commandWorks('unshare', ['-rn', 'true'])
        ? ['-rn']
        : commandWorks('unshare', ['-n', 'true'])
          ? ['-n']
          : null
      : null,
    docker: config.codeRunner.mode === 'docker' && commandWorks('docker', ['info']),
  };
  return capabilities;
}

function sandboxDescription() {
  const mode = config.codeRunner.mode;
  if (mode === 'disabled') return 'disabled';
  if (mode === 'docker') return `docker (${config.codeRunner.dockerImage}, --network none, memory/pids limits)`;
  const cap = detectCapabilities();
  const parts = ['child process', 'timeout'];
  if (cap.prlimit) parts.push('prlimit (cpu/memory/fsize/nofile)');
  if (cap.unshare) parts.push('no network (netns)');
  return parts.join(', ');
}

// Children get a minimal environment. On Windows the MinGW toolchain (cc1plus, as, ld) and
// the compiled program's runtime DLLs are located through PATH, so PATH is limited to the
// compiler's own directory plus the system directory.
let windowsPath;
function childEnv(cwd) {
  if (process.platform !== 'win32') return { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C' };
  if (windowsPath === undefined) {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const where = spawnSync('where', ['g++'], { encoding: 'utf8', timeout: 5000 });
    const gppPath = where.status === 0 ? where.stdout.split(/\r?\n/)[0].trim() : '';
    windowsPath = [gppPath && path.dirname(gppPath), path.join(systemRoot, 'System32'), systemRoot].filter(Boolean).join(';');
  }
  return { PATH: windowsPath, SystemRoot: process.env.SystemRoot || 'C:\\Windows', TEMP: cwd, TMP: cwd, LANG: 'C' };
}

// ------------------------------------------------------------------ concurrency gate
let running = 0;
const waiters = [];
async function acquire() {
  if (running < MAX_CONCURRENT) {
    running += 1;
    return;
  }
  await new Promise((resolve) => waiters.push(resolve));
  running += 1;
}
function release() {
  running -= 1;
  const next = waiters.shift();
  if (next) next();
}

// ------------------------------------------------------------------ process execution
function execLimited(cmd, args, { cwd, input = '', timeoutMs, maxOutput = MAX_OUTPUT_BYTES }) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const child = spawn(cmd, args, {
      cwd,
      env: childEnv(cwd),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32', // own process group so we can kill descendants
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let timedOut = false;
    let outputExceeded = false;

    const kill = () => {
      try {
        if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        /* already exited */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      if (stdout.length + chunk.length > maxOutput) {
        outputExceeded = true;
        kill();
        return;
      }
      stdout = Buffer.concat([stdout, chunk]);
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < MAX_STDERR_BYTES) stderr = Buffer.concat([stderr, chunk]).subarray(0, MAX_STDERR_BYTES);
    });
    child.stdin.on('error', () => {}); // program may exit without reading stdin
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: null, signal: null, stdout: '', stderr: err.message, timedOut, outputExceeded, timeMs: 0, spawnError: true });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const timeMs = Number(process.hrtime.bigint() - started) / 1e6;
      resolve({
        code,
        signal,
        // Windows text-mode stdout writes CRLF; show the same output on every platform.
        stdout: process.platform === 'win32' ? stdout.toString('utf8').replaceAll('\r\n', '\n') : stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
        timedOut,
        outputExceeded,
        timeMs: Math.round(timeMs),
      });
    });
    child.stdin.end(input);
  });
}

function wrapProcessRun(binary, { timeLimitMs, memoryLimitMb }) {
  const cap = detectCapabilities();
  let cmd = binary;
  let args = [];
  if (cap.prlimit) {
    args = [
      // soft limit -> SIGXCPU (reported as TLE), hard limit one second later -> SIGKILL
      `--cpu=${Math.ceil(timeLimitMs / 1000) + 1}:${Math.ceil(timeLimitMs / 1000) + 2}`,
      `--as=${memoryLimitMb * 1024 * 1024}`,
      '--fsize=1048576',
      '--nofile=32',
      '--core=0',
      binary,
    ];
    cmd = 'prlimit';
  }
  if (cap.unshare) {
    args = [...cap.unshare, cmd, ...args];
    cmd = 'unshare';
  }
  return { cmd, args };
}

function normalizeOutput(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).join(' ');
}

function classify(result, expected, timeLimitMs) {
  if (result.outputExceeded) return 'output_limit_exceeded';
  if (result.timedOut || result.signal === 'SIGXCPU') return 'time_limit_exceeded';
  if (result.signal === 'SIGKILL' && result.timeMs >= timeLimitMs) return 'time_limit_exceeded';
  if (result.code !== 0 || result.signal) return 'runtime_error';
  return normalizeOutput(result.stdout) === normalizeOutput(expected) ? 'passed' : 'wrong_answer';
}

const VERDICT_BY_STATUS = {
  wrong_answer: 'wrong_answer',
  runtime_error: 'runtime_error',
  time_limit_exceeded: 'time_limit_exceeded',
  output_limit_exceeded: 'output_limit_exceeded',
};

// ------------------------------------------------------------------ docker helpers
function dockerArgs(workDir, memoryLimitMb, command) {
  return [
    'run', '--rm', '-i',
    '--network', 'none',
    '--memory', `${memoryLimitMb}m`, '--memory-swap', `${memoryLimitMb}m`,
    '--cpus', '1', '--pids-limit', '64',
    '--read-only', '--tmpfs', '/tmp:rw,size=16m',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--user', '65534:65534',
    '-v', `${workDir}:/work`, '-w', '/work',
    config.codeRunner.dockerImage,
    ...command,
  ];
}

// ------------------------------------------------------------------ public API
function assertAvailable() {
  const mode = config.codeRunner.mode;
  if (mode === 'disabled') {
    throw AppError.unavailable('Code execution is disabled on this server (CODE_RUNNER=disabled).', 'CODE_EXECUTION_DISABLED');
  }
  if (mode === 'process' && config.isProduction && !config.codeRunner.allowUnsafe) {
    throw AppError.unavailable(
      'The local process sandbox is not enabled in production. Use CODE_RUNNER=docker or a dedicated judge service.',
      'CODE_EXECUTION_DISABLED',
    );
  }
  const cap = detectCapabilities();
  if (mode === 'docker' && !cap.docker) {
    throw AppError.unavailable('Docker is not available for code execution.', 'CODE_EXECUTION_UNAVAILABLE');
  }
  if (mode === 'process' && !cap.gpp) {
    throw AppError.unavailable('g++ is not installed on the server, so C++ code cannot be compiled.', 'CODE_EXECUTION_UNAVAILABLE');
  }
}

/**
 * Compile and judge C++ code against test cases.
 * @returns {{verdict, compileOutput, results, passedCount, totalCount, runtimeMs, sandbox}}
 */
async function judgeCpp({ code, tests, timeLimitMs = 2000, memoryLimitMb = 256 }) {
  assertAvailable();
  await acquire();
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'prepai-judge-'));
  const docker = config.codeRunner.mode === 'docker';
  try {
    await fs.promises.writeFile(path.join(workDir, 'main.cpp'), code, { mode: 0o600 });
    if (docker) await fs.promises.chmod(workDir, 0o777);

    const compile = docker
      ? await execLimited('docker', dockerArgs(workDir, 512, ['g++', '-std=c++17', '-O2', '-pipe', '-o', 'main', 'main.cpp']), {
        cwd: workDir,
        timeoutMs: COMPILE_TIMEOUT_MS,
      })
      : await execLimited('g++', ['-std=c++17', '-O2', '-pipe', '-o', 'main', 'main.cpp'], {
        cwd: workDir,
        timeoutMs: COMPILE_TIMEOUT_MS,
      });

    if (compile.spawnError) throw AppError.unavailable('The compiler could not be started.', 'CODE_EXECUTION_UNAVAILABLE');
    if (compile.code !== 0) {
      const output = compile.timedOut
        ? 'Compilation timed out.'
        : compile.stderr.replaceAll(workDir, '').replaceAll('/work/', '').slice(0, 4000);
      return { verdict: 'compile_error', compileOutput: output, results: [], passedCount: 0, totalCount: tests.length, runtimeMs: null, sandbox: sandboxDescription() };
    }

    const results = [];
    let verdict = 'accepted';
    let maxTime = 0;
    for (let i = 0; i < tests.length; i += 1) {
      const test = tests[i];
      if (verdict !== 'accepted') {
        results.push({ index: i, hidden: test.isHidden, status: 'skipped', timeMs: null });
        continue;
      }
      const wallLimit = timeLimitMs * 2 + 500;
      const run = docker
        ? await execLimited('docker', dockerArgs(workDir, memoryLimitMb, ['./main']), { cwd: workDir, input: test.input, timeoutMs: wallLimit + 3000 })
        : await (() => {
          const { cmd, args } = wrapProcessRun(path.join(workDir, 'main'), { timeLimitMs, memoryLimitMb });
          return execLimited(cmd, args, { cwd: workDir, input: test.input, timeoutMs: wallLimit });
        })();
      let status = classify(run, test.expectedOutput, timeLimitMs);
      if (status === 'passed' && !docker && run.timeMs > timeLimitMs * 1.5) status = 'time_limit_exceeded';
      maxTime = Math.max(maxTime, run.timeMs);
      if (status !== 'passed') verdict = VERDICT_BY_STATUS[status] || 'runtime_error';
      results.push({
        index: i,
        hidden: test.isHidden,
        status,
        timeMs: run.timeMs,
        // Hidden test data is never returned or stored.
        ...(test.isHidden
          ? {}
          : {
            input: test.input.slice(0, 2000),
            expectedOutput: test.expectedOutput.slice(0, 2000),
            actualOutput: run.stdout.slice(0, 2000),
            stderr: run.stderr.replaceAll(workDir, '').slice(0, 1000),
          }),
      });
    }
    return {
      verdict,
      compileOutput: compile.stderr.replaceAll(workDir, '').slice(0, 2000),
      results,
      passedCount: results.filter((r) => r.status === 'passed').length,
      totalCount: tests.length,
      runtimeMs: maxTime,
      sandbox: sandboxDescription(),
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error('Judge failure', err);
    return { verdict: 'internal_error', compileOutput: '', results: [], passedCount: 0, totalCount: tests.length, runtimeMs: null, sandbox: sandboxDescription() };
  } finally {
    release();
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { judgeCpp, sandboxDescription, detectCapabilities, normalizeOutput };
