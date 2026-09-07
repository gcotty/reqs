#!/usr/bin/env node

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log("Usage: reqs <command>");
    console.log("");
    console.log("Commands:");
    console.log(" run <file> Run a saved HTTP request");
    return;
  }

  const command = args[0];

  console.error(`Unknown command: ${command}`);
  process.exitCode = 2;
}

main();
