# Process capture

Process Capture runs one caller-selected command and records bounded evidence
about its terminal behavior, scheduled interactions, process lifetime, and
selected filesystem state. Use it to compare two direct runs of the same
scenario, such as an authority build and a reconstruction. It does not replay a
previous execution or emulate dependencies.

The command runs with the current user's permissions. This is not a sandbox.
The child receives only an allowlist of host variables (`PATH`, `HOME`, `USER`,
`LOGNAME`, `SHELL`, `LANG`, `LC_*`, `TERM`, `TMPDIR`, `TZ`) plus the scenario's
explicit `environment` and `REA_PROCESS_RUN_ID`; other host variables such as
API keys and tokens are not passed. Declare any other variable the command
needs in the scenario. Filesystem observation paths select what REA snapshots;
they do not restrict what the process can read or write. The dropped host
environment is not recorded, so its influence may remain unknown.

Over MCP, `capture_process_scenario` is off by default. The operator must set
`REA_ALLOW_PROGRAM_EXECUTION=1` in the MCP server environment; until then the
tool returns a structured refusal and starts nothing. Enabling it lets the
connected agent, including one steered by prompt-injected content, run
arbitrary programs as the current user. `observe_native_calls`,
`capture_native_ui_scenario`, `capture_electron_scenario`, and
`capture_browser_scenario` in `launch` mode share this gate. The CLI is run
directly by the operator and is not gated.

## Capture a command

Write a JSON scenario and pass its path to the CLI:

```sh
rea capture-process ./scenario.json --json > capture.json
```

`--json` is required when saving input for JSON consumers; the default terminal
format is TOON. The file contains the complete capture Evidence record.
Choose an output file distinct from the scenario input: shell redirection opens
and truncates the output before REA reads the scenario.

For example:

```json
{
  "executable": "node",
  "arguments": ["./signup.mjs"],
  "working_directory": ".",
  "environment": { "APP_MODE": "test" },
  "filesystem_observation_paths": ["./state"],
  "terminal": { "columns": 80, "rows": 24, "scrollback": 1000 },
  "events": [
    {
      "type": "input",
      "at_ms": 250,
      "data": "user@example.test\r",
      "sensitive": true
    },
    { "type": "resize", "at_ms": 500, "columns": 100, "rows": 30 },
    { "type": "signal", "at_ms": 1000, "signal": "SIGINT" }
  ],
  "timeout_ms": 30000,
  "idle_timeout_ms": 30000,
  "settle_ms": 100
}
```

`executable` is required. `arguments`, `working_directory`, `environment`,
`filesystem_observation_paths`, terminal settings, timed `events`, timeouts,
resource limits, and normalization settings have defaults; see
`processScenarioSchema` for the exact contract. Event times are milliseconds
from launch, must be ordered, and must fall within `timeout_ms`. Inputs marked
`sensitive` are sent to the process but persisted as a byte-count placeholder.
Environment overrides are recorded in the scenario commitment; inherited
values are not copied into Evidence.

The capture contains raw PTY output chunks and rendered terminal states,
interaction dispatch outcomes, exit reason, sampled process-tree observations,
and settlement status. When filesystem paths are selected, REA records
`files_before` and `files_after`, then classifies observed entries as created,
deleted, modified, or unchanged. These are bounded snapshots, not a syscall
trace; short-lived changes between snapshots may be missed. With no selected
paths, filesystem effects remain unknown.

Output, file count, file size, process sampling, filesystem depth, total
runtime, idle time, and post-exit settlement are bounded by the scenario's
limits. The result marks truncated observations and residual unknowns rather
than treating missing data as proof of equivalence. Cancellation and timeout
run the same owned-process cleanup path. Settlement reports whether the
sampled process group quiesced or whether cleanup was needed or unverifiable;
sampling cannot prove that every short-lived or detached descendant was seen.

When the host withholds an unrelated process’s ownership token, REA leaves that
process untouched and records its PID and reason in `cleanup.unverified_processes`
and process residual unknowns. Successful cleanup verifies the owned group;
it does not attribute those unrelated processes. Related or otherwise unexplained
unreadable processes still prevent successful cleanup.

On macOS, changing a Node process's `process.title` can make its run token
unreadable. Node documents that [setting the title overwrites argv memory](https://nodejs.org/download/release/v24.18.0/docs/api/process.html#processtitle).
With the pinned toolchain, a live child retained a readable start identity
while its token became unavailable after this change; npm changes its title
as well. A newly started unreadable process can prevent verified cleanup even
after the selected command exits. REA preserves this uncertainty and leaves
that process untouched.

## Compare two captures

Compare saved capture Evidence with:

```sh
rea compare-process-captures authority.json reconstruction.json
```

The comparison checks terminal, interaction, exit, filesystem, and
process observations under a shared comparison contract. It reports observed
differences with their locations, while residual unknowns or truncated
observations prevent a complete-equivalence claim. Matching scenario
commitments do not reveal whether redacted sensitive inputs were equal.

For scenarios where independent scheduling can change event order, the CLI
also accepts an optional trace-specification JSON file as the third argument.
That specification must state the exact events and ordering constraints to
accept; it does not discard unmatched observations or make timestamps into
causal evidence. Trace comparison returns `unknown` when a capture lacks the
required complete event journal or contains relevant residual unknowns.

Each capture carries commitments for the selected scenario, executable,
comparison contract, and normalization rules. The comparison contract covers
the working directory, explicit environment, filesystem observation paths,
terminal size, scripted events, timeouts, limits, and normalization; the
executable and its arguments may differ. Comparison rejects captures whose
comparison contracts differ and names the differing fields, so run both
scenarios from the same absolute working directory and observation paths.
Captures are local Evidence files; keep
their source artifacts and invocation context available when interpreting a
difference.
