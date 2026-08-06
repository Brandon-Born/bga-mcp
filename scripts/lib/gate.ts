/** Collects gate failures so a check can be run against real and seeded input. */
export class GateReport {
  readonly failures: string[] = [];

  require(condition: boolean, message: string): void {
    if (!condition) {
      this.failures.push(message);
    }
  }

  get failed(): boolean {
    return this.failures.length > 0;
  }
}

/**
 * Proves a gate detects a seeded defect. A gate that cannot fail is not a gate,
 * so every verification script runs its own negative case before reporting.
 */
export function expectSeededFailure(name: string, report: GateReport): void {
  if (!report.failed) {
    throw new Error(`The ${name} gate did not detect its seeded failure`);
  }
}

export function reportOrExit(name: string, report: GateReport, success: string): void {
  if (report.failed) {
    process.stderr.write(`${name} gate failed:\n- ${report.failures.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${success}\n`);
}
