import { describe, expect, it } from "vitest";

import { electronActiveObservationInputSchema } from "./electronActiveObservation.js";

const parse = (args: string[]) =>
  electronActiveObservationInputSchema.safeParse({
    executable_path: "/opt/electron/electron",
    application_path: "/opt/app/main.js",
    args,
  });

describe("electron args helper-executing switches", () => {
  it.each([
    "--gpu-launcher=/bin/sh",
    "--renderer-cmd-prefix=/bin/sh -c",
    "--utility-cmd-prefix=/bin/sh",
    "--browser-subprocess-path=/tmp/x",
    "--gpu-cmd-prefix=/bin/sh",
    "--ppapi-plugin-launcher=/bin/sh",
    "--zygote-cmd-prefix=/bin/sh",
    "--GPU-LAUNCHER=/bin/sh",
    "--gpu-launcher",
  ])("rejects %s", (arg) => {
    expect(parse(["--ok", arg]).success).toBe(false);
  });

  it("accepts ordinary switches", () => {
    expect(parse(["--token", "x", "--no-sandbox", "--lang=en"]).success).toBe(
      true,
    );
  });
});
