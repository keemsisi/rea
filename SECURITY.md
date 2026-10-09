# Security Policy

## Supported versions

Security fixes are provided for the latest published version of REA. Upgrade to the latest release before reporting a problem that may already have been resolved.

## Reporting a vulnerability

Do not disclose vulnerabilities, proof-of-concept exploits, credentials,
private binaries, Hopper documents, or private Ghidra projects in a public
issue.

Use **Report a vulnerability** in the repository's **Security** tab to submit the report privately. Do not open a public issue to request a private contact channel.

Include the affected REA version, operating system/distribution, selected
provider and version, impact, reproduction conditions, and any suggested
mitigation in the private report. Remove credentials, proprietary binaries,
Hopper documents, Ghidra project contents, socket capability tokens, and
unrelated local paths from logs or examples.

The maintainer will acknowledge the report, assess its scope, and coordinate
remediation and disclosure timing with the reporter. Please allow time for
provider-dependent behavior to be reproduced safely.

## Security boundary

REA authenticates each local provider bridge session with a random capability
token and a current-user Unix socket. Tokens are transferred through private
session descriptors rather than process arguments or environment variables.
This is not a sandbox and does not protect against malicious processes already
running as the same operating-system user. Opening an untrusted binary
delegates parsing and analysis to the selected local provider with that user's
permissions.

Tools that run a program chosen by the MCP caller are off by default:
`capture_process_scenario`, `observe_native_calls`,
`capture_native_ui_scenario`, `capture_electron_scenario`, and
`capture_browser_scenario` in `launch` mode (which takes an `executable_path`).
They return a structured refusal and start nothing until the operator sets
`REA_ALLOW_PROGRAM_EXECUTION=1` in the server environment. Enabling it lets the
connected agent, including one steered by prompt-injected content, run
arbitrary programs as the current user. `capture_process_scenario` passes the
child only an allowlist of host environment variables plus the scenario's
declared `environment`, so host credentials are not inherited, and Electron
capture rejects Chromium switches that execute helper programs
(`--*-launcher`, `--*-cmd-prefix`, `--browser-subprocess-path`). The gate and
these filters reduce accidental and injected execution; they are not a sandbox.

Ghidra sessions use a packaged Java `HeadlessScript`, an isolated temporary
project, and private home, cache, and runtime directories. REA imports only the
requested target, bounds startup and protocol messages, requests bounded CPU
and heap settings, and deletes the temporary project when the session closes.
These controls limit accidental persistence and resource use; they do not make
Ghidra a sandbox. REA does not open or modify user-owned Ghidra projects.

`GHIDRA_INSTALL_DIR` and optional `JAVA_HOME` identify user-managed
installations. Setup can add those values to detected client configuration only
after showing its plan and receiving approval. REA does not download, install,
upgrade, or modify Ghidra or Java.

On Linux, REA accepts release metadata only from Hopper's HTTPS endpoint, restricts package URLs to Hopper's public download origin, bounds the package size, and compares the downloaded bytes with Hopper's published checksum before requesting installation. The published SHA-1 value is a corruption check, not a modern package signature; HTTPS origin validation remains part of the trust boundary. Dependency installation is delegated without shell evaluation to `apt-get`, `dnf`, or `pacman`, directly as root or through `pkexec`. REA never invokes `sudo`.
