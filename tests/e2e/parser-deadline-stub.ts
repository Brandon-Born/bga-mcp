/**
 * Advances the installed server's monotonic clock only at the JSONC parser's
 * periodic deadline checkpoint. Loaded through a test process's `--import`,
 * this file is not packed and adds no production callback or configuration.
 */
import { appendFileSync, readFileSync } from 'node:fs';

const control = process.env.BGA_MCP_PARSER_DEADLINE_CONTROL;
const transcript = process.env.BGA_MCP_PARSER_DEADLINE_TRANSCRIPT;
const deadlineMs = Number.parseInt(process.env.BGA_MCP_PARSER_DEADLINE_MS ?? '', 10);
const expireOnCheckpoint = Number.parseInt(
  process.env.BGA_MCP_PARSER_DEADLINE_CHECKPOINT ?? '',
  10,
);

if (
  control === undefined ||
  transcript === undefined ||
  !Number.isInteger(deadlineMs) ||
  deadlineMs <= 0 ||
  !Number.isInteger(expireOnCheckpoint) ||
  expireOnCheckpoint <= 1
) {
  throw new Error(
    'The parser deadline probe requires control/transcript paths, a positive deadline, and a checkpoint after the first',
  );
}

const controlPath = control;
const transcriptPath = transcript;
const originalNow = performance.now.bind(performance);
let sequence = 0;
let parserCheckpoints = 0;

function armed(): boolean {
  try {
    return readFileSync(controlPath, 'utf8').trim() === 'armed';
  } catch {
    return false;
  }
}

function record(stage: 'register' | 'parser-checkpoint', value: number): void {
  sequence += 1;
  appendFileSync(
    transcriptPath,
    `${JSON.stringify({ sequence, stage, parserCheckpoints, value })}\n`,
    { encoding: 'utf8' },
  );
}

Object.defineProperty(performance, 'now', {
  configurable: true,
  value: function instrumentedMonotonicClock(): number {
    if (!armed()) {
      return originalNow();
    }

    const stack = new Error().stack ?? '';
    if (stack.includes('registerDeadline')) {
      record('register', 0);
      return 0;
    }

    const parserCheckpoint =
      stack.includes('periodicCancellationCheckpoint') && stack.includes('parseJsonc');
    if (!parserCheckpoint) {
      return 0;
    }

    parserCheckpoints += 1;
    const value = parserCheckpoints >= expireOnCheckpoint ? deadlineMs + 1 : 0;
    record('parser-checkpoint', value);
    return value;
  },
});
