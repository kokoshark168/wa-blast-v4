import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// ── Claude Code Bridge ─────────────────────────────────────────
// Nyx ↔ Claude Code delegation system

const CLAUDE_BIN = '/opt/homebrew/bin/claude';
const LOG_DIR = '/tmp/claude-bridge';

/**
 * Run Claude Code synchronously on a project directory with a prompt.
 * Uses spawnSync (no shell) — handles special chars safely.
 */
export function runClaude(projectDir, prompt, options = {}) {
  const {
    allowedTools = 'Bash(git:*) Edit Write Read',
    timeout = 600000,       // 10 min
    effort = 'high',
    extraDirs = [],
  } = options;

  if (!fs.existsSync(CLAUDE_BIN)) {
    throw new Error('Claude Code not installed at ' + CLAUDE_BIN);
  }
  if (!fs.existsSync(projectDir)) {
    throw new Error('Project dir not found: ' + projectDir);
  }
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

  const args = [
    '-p',
    '--add-dir', projectDir,
    '--allowedTools', allowedTools,
    '--effort', effort,
    '--dangerously-skip-permissions',
    prompt,
  ];

  for (const dir of extraDirs) args.push('--add-dir', dir);

  const result = spawnSync(CLAUDE_BIN, args, {
    cwd: projectDir,
    timeout,
    maxBuffer: 10 * 1024 * 1024,
    encoding: 'utf-8',
    env: { ...process.env, HOME: process.env.HOME },
  });

  const output = (result.stdout || '') + (result.stderr || '');
  const success = result.status === 0 && output.length > 0;

  const logFile = path.join(LOG_DIR, `claude-${Date.now()}.log`);
  fs.writeFileSync(logFile, output);

  const filesChanged = [...new Set(
    (output.match(/`([^`]+\.(js|json|html|css|md|ts|py))`/g) || [])
      .map(f => f.replace(/`/g, ''))
  )];

  return {
    success,
    output: output.slice(-5000),
    fullLog: logFile,
    filesChanged,
    exitCode: result.status,
    signal: result.signal,
  };
}

/**
 * List recent Claude Code sessions/logs
 */
export function listLogs() {
  if (!fs.existsSync(LOG_DIR)) return [];
  return fs.readdirSync(LOG_DIR)
    .filter(f => f.startsWith('claude-'))
    .sort()
    .reverse()
    .slice(0, 10)
    .map(f => ({ file: f, path: path.join(LOG_DIR, f) }));
}

/**
 * Read a specific Claude log
 */
export function readLog(filename) {
  const fp = path.join(LOG_DIR, filename);
  if (!fs.existsSync(fp)) return null;
  return fs.readFileSync(fp, 'utf-8');
}
