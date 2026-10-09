import type { CallToolResult } from "@modelcontextprotocol/server";

import { TOOL_EFFECTS } from "../contracts/toolEffects.js";
import { AnalysisCapabilityUnavailableError } from "../domain/analysisErrorCore.js";
import { toErrorToolResult } from "./toolResult.js";

export const PROGRAM_EXECUTION_ENV = "REA_ALLOW_PROGRAM_EXECUTION";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** True when this call would run a program the caller selected. */
export const requiresProgramExecution = (
  tool: string,
  input: unknown,
): boolean => {
  if (TOOL_EFFECTS[tool]?.executesCallerSelectedProgram === true) return true;
  return (
    tool === "capture_browser_scenario" &&
    isRecord(input) &&
    isRecord(input["browser"]) &&
    input["browser"]["mode"] === "launch"
  );
};

/** Structured refusal returned, without spawning anything, while the gate is closed. */
export const programExecutionRefusal = (tool: string): CallToolResult =>
  toErrorToolResult(
    new AnalysisCapabilityUnavailableError(
      "rea",
      tool,
      `running caller-selected programs is disabled; the operator must set ${PROGRAM_EXECUTION_ENV}=1 in the server environment to enable it (off by default)`,
      {
        userMessage: `${tool} runs a program chosen by the caller and is off by default. The operator can enable it by setting ${PROGRAM_EXECUTION_ENV}=1 for the REA server.`,
      },
    ),
  );
