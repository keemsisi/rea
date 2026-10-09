import { describe, expect, it } from "vitest";

import type { ProcessScenario } from "../../domain/process/processCapture.js";
import { makeProcessCaptureEnvironment } from "./ProcessCaptureEnvironment.js";

const build = (
  hostEnvironment: Record<string, string | undefined>,
  environment: Record<string, string> = {},
) =>
  makeProcessCaptureEnvironment({
    scenario: { environment } as unknown as ProcessScenario,
    runId: "run-1",
    hostEnvironment,
  });

describe("makeProcessCaptureEnvironment", () => {
  it("drops host credentials and keeps the allowlisted variables", () => {
    const env = build({
      PATH: "/usr/bin",
      HOME: "/home/u",
      LC_ALL: "C",
      GITHUB_TOKEN: "ghp_secret",
      ANTHROPIC_API_KEY: "sk-secret",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
    });
    expect(env["PATH"]).toBe("/usr/bin");
    expect(env["HOME"]).toBe("/home/u");
    expect(env["LC_ALL"]).toBe("C");
    expect(env["GITHUB_TOKEN"]).toBeUndefined();
    expect(env["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(env["AWS_SECRET_ACCESS_KEY"]).toBeUndefined();
  });

  it("passes caller-declared variables and the run id", () => {
    const env = build({ PATH: "/usr/bin" }, { MY_FLAG: "1", PATH: "/custom" });
    expect(env["MY_FLAG"]).toBe("1");
    expect(env["PATH"]).toBe("/custom");
    expect(env["REA_PROCESS_RUN_ID"]).toBe("run-1");
    expect(env["TERM"]).toBe("xterm-256color");
  });
});
