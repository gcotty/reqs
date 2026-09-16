#!/usr/bin/env node

import {
  executeRequest,
  type ExecuteRequestOptions,
} from "./core/execute-request.js";
import { formatResponseBody } from "./core/format-response-body.js";
import { loadProjectConfigJson } from "./core/load-project-config.js";
import { loadRequestJson } from "./core/load-request.js";
import {
  listRequestNames,
  resolveRequestFilePath,
} from "./core/request-discovery.js";
import { resolveAuth } from "./core/resolve-auth.js";
import { validateProjectConfig } from "./core/validate-project-config.js";
import { validateRequest } from "./core/validate-request.js";

interface RunArguments {
  filePath: string;
  pathOverrides: Map<string, string>;
  queryOverrides: Map<string, string>;
}

function parseRunArguments(args: string[]): RunArguments {
  const filePath = args[0];

  if (filePath === undefined) {
    throw new Error(
      "Usage: reqs run <file|name> [--path name=value] [--query name=value]",
    );
  }

  const pathOverrides = new Map<string, string>();
  const queryOverrides = new Map<string, string>();

  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];

    if (argument !== "--query" && argument !== "--path") {
      throw new Error(`Unknown run option: ${argument}`);
    }

    const assignment = args[index + 1];

    if (assignment === undefined) {
      throw new Error(`${argument} requires name=value`);
    }

    const separatorIndex = assignment.indexOf("=");

    if (separatorIndex <= 0) {
      throw new Error(`${argument} requires a non-empty name in name=value`);
    }

    const name = assignment.slice(0, separatorIndex);
    const value = assignment.slice(separatorIndex + 1);

    if (argument === "--path") {
      if (value === "") {
        throw new Error("--path requires a non-empty value in name=value");
      }

      pathOverrides.set(name, value);
    } else {
      queryOverrides.set(name, value);
    }
    index += 1;
  }

  return {
    filePath,
    pathOverrides,
    queryOverrides,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log("Usage: reqs <command>");
    console.log("");
    console.log("Commands:");
    console.log(
      " run <file|name> [--path name=value] [--query name=value] Run a saved HTTP request",
    );
    console.log(" list List saved requests");
    return;
  }

  const command = args[0];

  if (command === "list") {
    try {
      if (args.length !== 1) {
        throw new Error("Usage: reqs list");
      }

      const names = await listRequestNames();

      if (names.length > 0) {
        process.stdout.write(`${names.join("\n")}\n`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      console.error(
        message.startsWith("Usage:")
          ? message
          : `Failed to list requests: ${message}`,
      );
      process.exitCode = 2;
    }

    return;
  }

  if (command === "run") {
    try {
      const { filePath: inputPath, pathOverrides, queryOverrides } =
        parseRunArguments(args.slice(1));
      const filePath = await resolveRequestFilePath(inputPath);
      const input = await loadRequestJson(filePath);
      const request = validateRequest(input);

      const loadedConfig = await loadProjectConfigJson(filePath);
      const config = validateProjectConfig(loadedConfig.input);

      const executeOptions: ExecuteRequestOptions = {
        requestFilePath: filePath,
      };

      if (pathOverrides.size > 0) {
        executeOptions.pathOverrides = pathOverrides;
      }

      if (queryOverrides.size > 0) {
        executeOptions.queryOverrides = queryOverrides;
      }

      if (request.auth !== undefined) {
        executeOptions.auth = await resolveAuth(request.auth, config);
      }

      const { response, body, durationMs } = await executeRequest(
        request,
        executeOptions,
      );

      const outputBody = formatResponseBody(
        body,
        response.headers.get("content-type"),
      );

      process.stdout.write(outputBody);

      console.error(
        `${response.status} ${response.statusText} (${durationMs.toFixed(0)} ms)`,
      );

      if (response.status >= 400) {
        process.exitCode = 1;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      console.error(
        message.startsWith("Usage:")
          ? message
          : `Failed to run request: ${message}`,
      );
      process.exitCode = 2;
    }

    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exitCode = 2;
}

await main();
