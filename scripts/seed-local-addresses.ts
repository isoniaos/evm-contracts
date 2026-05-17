import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ENV_ADDRESS_NAMES = ["GOV_CORE_ADDRESS", "GOV_PROPOSALS_ADDRESS", "DEMO_TARGET_ADDRESS"] as const;

const IGNITION_ADDRESS_KEYS = {
  govCore: "IsoniaProtocolV01Module#GovCore",
  govProposals: "IsoniaProtocolV01Module#GovProposals",
  demoTarget: "IsoniaProtocolV01Module#DemoTarget",
  demoVotesToken: "IsoniaProtocolV01Module#IsoDemoVotesToken",
} as const;

export interface SeedAddressEnv {
  readonly GOV_CORE_ADDRESS?: string;
  readonly GOV_PROPOSALS_ADDRESS?: string;
  readonly DEMO_TARGET_ADDRESS?: string;
  readonly DEMO_VOTES_TOKEN_ADDRESS?: string;
}

export interface ResolveSeedContractAddressesOptions {
  readonly chainId: bigint | number | string;
  readonly env?: SeedAddressEnv;
  readonly projectRoot?: string;
}

export interface SeedContractAddresses {
  readonly govCore: string;
  readonly govProposals: string;
  readonly demoTarget: string;
  readonly demoVotesToken?: string;
  readonly source: "env" | "ignition";
  readonly ignitionDeploymentFile?: string;
}

export function resolveSeedContractAddresses(options: ResolveSeedContractAddressesOptions): SeedContractAddresses {
  const env = options.env ?? process.env;
  const envAddresses = {
    govCore: normalizeAddress(env.GOV_CORE_ADDRESS),
    govProposals: normalizeAddress(env.GOV_PROPOSALS_ADDRESS),
    demoTarget: normalizeAddress(env.DEMO_TARGET_ADDRESS),
    demoVotesToken: normalizeAddress(env.DEMO_VOTES_TOKEN_ADDRESS),
  };
  const requiredEnvAddresses = {
    govCore: envAddresses.govCore,
    govProposals: envAddresses.govProposals,
    demoTarget: envAddresses.demoTarget,
  };

  const providedEnvCount = Object.values(requiredEnvAddresses).filter((value) => value !== undefined).length;

  if (providedEnvCount === ENV_ADDRESS_NAMES.length) {
    return {
      govCore: envAddresses.govCore!,
      govProposals: envAddresses.govProposals!,
      demoTarget: envAddresses.demoTarget!,
      ...(envAddresses.demoVotesToken === undefined ? {} : { demoVotesToken: envAddresses.demoVotesToken }),
      source: "env",
    };
  }

  if (providedEnvCount > 0) {
    const missing = [
      envAddresses.govCore === undefined ? "GOV_CORE_ADDRESS" : undefined,
      envAddresses.govProposals === undefined ? "GOV_PROPOSALS_ADDRESS" : undefined,
      envAddresses.demoTarget === undefined ? "DEMO_TARGET_ADDRESS" : undefined,
    ].filter((value): value is string => value !== undefined);

    throw new Error(
      `Set all of ${formatEnvAddressNames()}, or leave all unset so seed:local can use the local Ignition deployment. Missing: ${missing.join(", ")}.`,
    );
  }

  const chainId = String(options.chainId);
  const projectRoot = options.projectRoot ?? process.cwd();
  const deploymentFile = join(projectRoot, "ignition", "deployments", `chain-${chainId}`, "deployed_addresses.json");

  if (!existsSync(deploymentFile)) {
    throw missingIgnitionDeploymentError(chainId, deploymentFile);
  }

  const deployedAddresses = readIgnitionDeploymentFile(deploymentFile);
  const govCore = normalizeAddress(deployedAddresses[IGNITION_ADDRESS_KEYS.govCore]);
  const govProposals = normalizeAddress(deployedAddresses[IGNITION_ADDRESS_KEYS.govProposals]);
  const demoTarget = normalizeAddress(deployedAddresses[IGNITION_ADDRESS_KEYS.demoTarget]);
  const demoVotesToken = normalizeAddress(deployedAddresses[IGNITION_ADDRESS_KEYS.demoVotesToken]);
  const missingKeys: string[] = [];
  if (govCore === undefined) {
    missingKeys.push(IGNITION_ADDRESS_KEYS.govCore);
  }
  if (govProposals === undefined) {
    missingKeys.push(IGNITION_ADDRESS_KEYS.govProposals);
  }
  if (demoTarget === undefined) {
    missingKeys.push(IGNITION_ADDRESS_KEYS.demoTarget);
  }

  if (missingKeys.length > 0) {
    throw new Error(
      `Ignition deployment file ${deploymentFile} is missing ${missingKeys.join(", ")}. Run \`corepack pnpm deploy:local\` first, then run \`corepack pnpm seed:local\`.`,
    );
  }

  return {
    govCore: govCore!,
    govProposals: govProposals!,
    demoTarget: demoTarget!,
    ...(demoVotesToken === undefined ? {} : { demoVotesToken }),
    source: "ignition",
    ignitionDeploymentFile: deploymentFile,
  };
}

function normalizeAddress(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readIgnitionDeploymentFile(deploymentFile: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(deploymentFile, "utf8")) as unknown;

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected a JSON object");
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(
      `Could not read local Ignition deployment addresses from ${deploymentFile}: ${message}. Run \`corepack pnpm deploy:local\` first, then run \`corepack pnpm seed:local\`.`,
    );
  }
}

function missingIgnitionDeploymentError(chainId: string, deploymentFile: string): Error {
  return new Error(
    `No local Ignition deployment addresses found for chain ${chainId} at ${deploymentFile}. Run \`corepack pnpm deploy:local\` first, then run \`corepack pnpm seed:local\`, or set all of ${formatEnvAddressNames()}.`,
  );
}

function formatEnvAddressNames(): string {
  return ENV_ADDRESS_NAMES.join(", ");
}
