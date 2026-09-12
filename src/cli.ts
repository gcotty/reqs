#!/usr/bin/env node

import { executeRequest } from "./core/execute-request.js";
import { loadRequestJson } from "./core/load-request.js";
import { validateRequest } from "./core/validate-request.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log("Usage: reqs <command>");
    console.log("");
    console.log("Commands:");
    console.log(" run <file> Run a saved HTTP request");
    return;
  }

  const command = args[0];

  if (command === "run") {
    const filePath = args[1];

    if (filePath === undefined) {
      console.error("Usage: reqs run <file>");
      process.exitCode = 2;
      return;
    }

    try {
      const input = await loadRequestJson(filePath);
      const request = validateRequest(input);
      const { response, body, durationMs } = await executeRequest(request);

      process.stdout.write(body);

      console.error(
        `${response.status} ${response.statusText} (${durationMs.toFixed(0)} ms)`,
      );

      if (response.status >= 400) {
        process.exitCode = 1;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      console.error(`Failed to run request: ${message}`);
      process.exitCode = 2;
    }

    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exitCode = 2;
}

await main();
