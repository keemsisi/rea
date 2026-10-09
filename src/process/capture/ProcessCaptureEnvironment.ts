import type { ProcessScenario } from "../../domain/process/processCapture.js";

interface ProcessCaptureEnvironmentOptions {
  readonly scenario: ProcessScenario;
  readonly runId: string;
  readonly hostEnvironment: Readonly<Record<string, string | undefined>>;
}

const INHERITED_HOST_NAMES: ReadonlySet<string> = new Set([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "TERM",
  "TMPDIR",
  "TZ",
]);

const inheritedFromHost = (name: string): boolean =>
  INHERITED_HOST_NAMES.has(name) || name.startsWith("LC_");

/**
 * Build the child environment from an allowlist of host variables, so host
 * credentials never reach the target, plus caller-declared overrides.
 */
export const makeProcessCaptureEnvironment = (
  options: ProcessCaptureEnvironmentOptions,
): Record<string, string> => ({
  ...Object.fromEntries(
    Object.entries(options.hostEnvironment).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && inheritedFromHost(entry[0]),
    ),
  ),
  ...options.scenario.environment,
  TERM:
    options.scenario.environment.TERM ??
    options.hostEnvironment.TERM ??
    "xterm-256color",
  REA_PROCESS_RUN_ID: options.runId,
});
