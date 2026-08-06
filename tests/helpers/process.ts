import { spawn } from 'node:child_process';

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export async function runCommand(
  command: string,
  arguments_: readonly string[],
  options: {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly timeoutMs?: number;
  } = {},
): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs ?? 30_000);

    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`Command timed out: ${command} ${arguments_.join(' ')}`));
        return;
      }
      if (signal !== null) {
        reject(new Error(`Command exited from signal ${signal}: ${command}`));
        return;
      }
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}
