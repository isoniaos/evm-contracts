import { spawn } from "node:child_process";

const network = process.env.HARDHAT_NODE_NETWORK ?? "hardhatMainnet";
const hostname = process.env.HARDHAT_NODE_HOST ?? "127.0.0.1";
const port = process.env.HARDHAT_NODE_PORT ?? "8545";
const hardhatBin = "hardhat";
const verboseLogs = process.env.HARDHAT_VERBOSE_LOGS === "true";

const child = spawn(
  hardhatBin,
  ["--network", network, "node", "--hostname", hostname, "--port", port],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (!verboseLogs) {
  disableHardhatRequestLogsWhenReady().catch((error) => {
    console.warn(
      `[node:local] could not disable Hardhat request logging: ${error.message}`,
    );
  });
}

child.on("error", (error) => {
  console.error(`[node:local] failed to start Hardhat: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.exit(1);
    return;
  }

  process.exit(code ?? 0);
});

async function disableHardhatRequestLogsWhenReady() {
  const rpcHostname =
    hostname === "0.0.0.0" || hostname === "::" ? "127.0.0.1" : hostname;
  const rpcUrl = `http://${rpcHostname}:${port}`;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "hardhat_setLoggingEnabled",
    params: [false],
  });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) {
      return;
    }

    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });

      if (response.ok) {
        return;
      }
    } catch {
      // The node is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`timed out waiting for ${rpcUrl}`);
}
