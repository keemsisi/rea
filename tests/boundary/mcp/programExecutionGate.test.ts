import { existsSync } from "node:fs";
import { join } from "node:path";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, test } from "vitest";

import type { BrowserScenarioCapturePort } from "../../../src/application/BrowserScenarioCapturePort.js";
import type { ElectronActiveObservationPort } from "../../../src/application/javascript/ElectronActiveObservationPort.js";
import {
  annotationsFromEffects,
  TOOL_EFFECTS,
} from "../../../src/contracts/toolEffects.js";
import { err } from "../../../src/domain/result.js";
import { AnalysisProtocolError } from "../../../src/domain/analysisErrorCore.js";
import {
  createServer,
  type CreateServerOptions,
} from "../../../src/server/createServer.js";
import { observed } from "../../fixtures/analysisExecution.js";
import { createTestBinarySession } from "../../fixtures/binarySession.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

const GATED_TOOLS = [
  "capture_process_scenario",
  "observe_native_calls",
  "capture_electron_scenario",
  "capture_native_ui_scenario",
] as const;

const resources: Array<{ close(): Promise<unknown> }> = [];
afterEach(async () => {
  await Promise.all(resources.splice(0).map((item) => item.close()));
});

const connect = async (options: CreateServerOptions) => {
  const session = createTestBinarySession(() => ({
    execute: () => Promise.resolve(observed(null)),
    close: () => Promise.resolve(),
  }));
  const server = createServer(session, session, {
    availabilityPolicy: () => ({
      processCaptureEnabled: true,
      investigationInputRoots: 0,
    }),
    ...options,
  });
  const client = new Client({ name: "program-gate-test", version: "1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  resources.push(client, server, session);
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
};

const spies = () => {
  const calls = { electron: 0, browser: 0 };
  const failure = () => err(new AnalysisProtocolError("spy provider reached"));
  const identity = { id: "spy", name: "spy", version: "1" };
  const electronActiveObservation: ElectronActiveObservationPort = {
    identity: () => identity,
    capture: () => {
      calls.electron += 1;
      return Promise.resolve(failure());
    },
  };
  const browserScenarioCapture: BrowserScenarioCapturePort = {
    identity: () => identity,
    captureScenario: () => {
      calls.browser += 1;
      return Promise.resolve(failure());
    },
  };
  return { calls, electronActiveObservation, browserScenarioCapture };
};

const argumentsFor = (marker: string): Record<string, unknown> => ({
  capture_process_scenario: {
    executable: process.execPath,
    arguments: [
      "-e",
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "x")`,
    ],
  },
  observe_native_calls: {
    breakpoints: [{ kind: "function", name: "open" }],
    duration_ms: 1000,
  },
  capture_electron_scenario: {
    executable_path: process.execPath,
    application_path: process.execPath,
    actions: [],
  },
  capture_native_ui_scenario: {
    pid: 123,
    window_id: 456,
    steps: [{ kind: "wait", milliseconds: 100 }],
  },
});

const browserArguments = (browser: Record<string, unknown>) => ({
  browser,
  start_url: { url: "https://app.example.test/", query: [] },
  actions: [{ step_id: "settle", action: "wait_for_timeout", duration_ms: 1 }],
});

const refusalText = (result: {
  readonly isError?: boolean | undefined;
  readonly structuredContent?: unknown;
}): string => {
  expect(result.isError).toBe(true);
  return JSON.stringify(result.structuredContent);
};

describe("program execution gate", () => {
  test.each(GATED_TOOLS)(
    "%s is refused while the gate is closed",
    async (tool) => {
      const directory = await createTestTempDirectory("rea-gate-");
      const marker = join(directory, "spawned");
      const spy = spies();
      const client = await connect(spy);
      const result = await client.callTool({
        name: tool,
        arguments: argumentsFor(marker)[tool] as Record<string, unknown>,
      });
      const text = refusalText(result);
      expect(text).toContain("REA_ALLOW_PROGRAM_EXECUTION");
      expect(text).toContain("off by default");
      expect(existsSync(marker)).toBe(false);
      expect(spy.calls.electron).toBe(0);
    },
  );

  test("a closed gate is the default and an explicit false is the same", async () => {
    const spy = spies();
    const client = await connect({ ...spy, allowProgramExecution: false });
    const result = await client.callTool({
      name: "capture_electron_scenario",
      arguments: argumentsFor("/unused")["capture_electron_scenario"] as Record<
        string,
        unknown
      >,
    });
    expect(refusalText(result)).toContain("REA_ALLOW_PROGRAM_EXECUTION");
    expect(spy.calls.electron).toBe(0);
  });

  test("browser launch mode (executable_path) is refused and never reaches the provider", async () => {
    const spy = spies();
    const client = await connect(spy);
    const result = await client.callTool({
      name: "capture_browser_scenario",
      arguments: browserArguments({
        mode: "launch",
        executable_path: process.execPath,
      }),
    });
    expect(refusalText(result)).toContain("REA_ALLOW_PROGRAM_EXECUTION");
    expect(spy.calls.browser).toBe(0);
  });

  test("browser connect mode runs nothing and is not gated", async () => {
    const spy = spies();
    const client = await connect(spy);
    const result = await client.callTool({
      name: "capture_browser_scenario",
      arguments: browserArguments({
        mode: "connect",
        cdp_endpoint: "http://127.0.0.1:9222",
        target_id: "target-1",
      }),
    });
    expect(spy.calls.browser).toBe(1);
    expect(JSON.stringify(result)).not.toContain("REA_ALLOW_PROGRAM_EXECUTION");
  });

  test("an open gate reaches the electron and browser providers", async () => {
    const spy = spies();
    const client = await connect({ ...spy, allowProgramExecution: true });
    await client.callTool({
      name: "capture_electron_scenario",
      arguments: argumentsFor("/unused")["capture_electron_scenario"] as Record<
        string,
        unknown
      >,
    });
    await client.callTool({
      name: "capture_browser_scenario",
      arguments: browserArguments({
        mode: "launch",
        executable_path: process.execPath,
      }),
    });
    expect(spy.calls).toEqual({ electron: 1, browser: 1 });
  });

  test("an open gate lets capture_process_scenario spawn the program", async () => {
    const directory = await createTestTempDirectory("rea-gate-open-");
    const marker = join(directory, "spawned");
    const client = await connect({ allowProgramExecution: true });
    await client.callTool({
      name: "capture_process_scenario",
      arguments: argumentsFor(marker)["capture_process_scenario"] as Record<
        string,
        unknown
      >,
    });
    expect(existsSync(marker)).toBe(true);
  });

  test("gated tools advertise destructiveHint", () => {
    for (const tool of GATED_TOOLS) {
      const effects = TOOL_EFFECTS[tool];
      expect(effects?.executesCallerSelectedProgram).toBe(true);
      if (effects === undefined) throw new Error(tool);
      expect(annotationsFromEffects(effects).destructiveHint).toBe(true);
    }
  });
});
