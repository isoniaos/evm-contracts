import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ENV_ADDRESS_NAMES = [
  "ISONIA_CORE_ADDRESS",
  "ISONIA_PROPOSALS_ADDRESS",
  "DEMO_TARGET_ADDRESS",
  "DEMO_OWNABLE_TARGET_ADDRESS",
  "DEMO_ACCESS_CONTROL_TARGET_ADDRESS",
  "DEMO_ACCESS_MANAGER_ADDRESS",
  "DEMO_ACCESS_MANAGED_TARGET_ADDRESS",
] as const;

const IGNITION_ADDRESS_KEYS = {
  isoCore: "IsoniaDemoLocalModule#IsoCore",
  isoProposals: "IsoniaDemoLocalModule#IsoProposals",
  demoTarget: "IsoniaDemoLocalModule#DemoTarget",
  demoVotesToken: "IsoniaDemoLocalModule#IsoDemoVotesToken",
  demoOwnableTarget: "IsoniaDemoLocalModule#IsoOwnableTarget",
  demoAccessControlTarget: "IsoniaDemoLocalModule#IsoAccessControlTarget",
  demoAccessManager: "IsoniaDemoLocalModule#IsoDemoAccessManager",
  demoAccessManagedTarget: "IsoniaDemoLocalModule#IsoAccessManagedTarget",
} as const;

export interface DemoLocalAddressEnv {
  readonly ISONIA_CORE_ADDRESS?: string;
  readonly ISONIA_PROPOSALS_ADDRESS?: string;
  readonly DEMO_TARGET_ADDRESS?: string;
  readonly DEMO_VOTES_TOKEN_ADDRESS?: string;
  readonly DEMO_OWNABLE_TARGET_ADDRESS?: string;
  readonly DEMO_ACCESS_CONTROL_TARGET_ADDRESS?: string;
  readonly DEMO_ACCESS_MANAGER_ADDRESS?: string;
  readonly DEMO_ACCESS_MANAGED_TARGET_ADDRESS?: string;
}

export interface ResolveDemoLocalContractAddressesOptions {
  readonly chainId: bigint | number | string;
  readonly env?: DemoLocalAddressEnv;
  readonly projectRoot?: string;
}

export interface DemoLocalContractAddresses {
  readonly isoCore: string;
  readonly isoProposals: string;
  readonly demoTarget: string;
  readonly demoVotesToken?: string;
  readonly demoOwnableTarget: string;
  readonly demoAccessControlTarget: string;
  readonly demoAccessManager: string;
  readonly demoAccessManagedTarget: string;
  readonly source: "env" | "ignition";
  readonly ignitionDeploymentFile?: string;
}

export function resolveDemoLocalContractAddresses(options: ResolveDemoLocalContractAddressesOptions): DemoLocalContractAddresses {
  const env = options.env ?? process.env;
  const envAddresses = {
    isoCore: normalizeAddress(env.ISONIA_CORE_ADDRESS),
    isoProposals: normalizeAddress(env.ISONIA_PROPOSALS_ADDRESS),
    demoTarget: normalizeAddress(env.DEMO_TARGET_ADDRESS),
    demoVotesToken: normalizeAddress(env.DEMO_VOTES_TOKEN_ADDRESS),
    demoOwnableTarget: normalizeAddress(env.DEMO_OWNABLE_TARGET_ADDRESS),
    demoAccessControlTarget: normalizeAddress(env.DEMO_ACCESS_CONTROL_TARGET_ADDRESS),
    demoAccessManager: normalizeAddress(env.DEMO_ACCESS_MANAGER_ADDRESS),
    demoAccessManagedTarget: normalizeAddress(env.DEMO_ACCESS_MANAGED_TARGET_ADDRESS),
  };
  const requiredEnvAddresses = {
    isoCore: envAddresses.isoCore,
    isoProposals: envAddresses.isoProposals,
    demoTarget: envAddresses.demoTarget,
    demoOwnableTarget: envAddresses.demoOwnableTarget,
    demoAccessControlTarget: envAddresses.demoAccessControlTarget,
    demoAccessManager: envAddresses.demoAccessManager,
    demoAccessManagedTarget: envAddresses.demoAccessManagedTarget,
  };

  const providedEnvCount = Object.values(requiredEnvAddresses).filter((value) => value !== undefined).length;

  if (providedEnvCount === ENV_ADDRESS_NAMES.length) {
    return {
      isoCore: envAddresses.isoCore!,
      isoProposals: envAddresses.isoProposals!,
      demoTarget: envAddresses.demoTarget!,
      ...(envAddresses.demoVotesToken === undefined ? {} : { demoVotesToken: envAddresses.demoVotesToken }),
      demoOwnableTarget: envAddresses.demoOwnableTarget!,
      demoAccessControlTarget: envAddresses.demoAccessControlTarget!,
      demoAccessManager: envAddresses.demoAccessManager!,
      demoAccessManagedTarget: envAddresses.demoAccessManagedTarget!,
      source: "env",
    };
  }

  if (providedEnvCount > 0) {
    const missing = [
      envAddresses.isoCore === undefined ? "ISONIA_CORE_ADDRESS" : undefined,
      envAddresses.isoProposals === undefined ? "ISONIA_PROPOSALS_ADDRESS" : undefined,
      envAddresses.demoTarget === undefined ? "DEMO_TARGET_ADDRESS" : undefined,
      envAddresses.demoOwnableTarget === undefined ? "DEMO_OWNABLE_TARGET_ADDRESS" : undefined,
      envAddresses.demoAccessControlTarget === undefined ? "DEMO_ACCESS_CONTROL_TARGET_ADDRESS" : undefined,
      envAddresses.demoAccessManager === undefined ? "DEMO_ACCESS_MANAGER_ADDRESS" : undefined,
      envAddresses.demoAccessManagedTarget === undefined ? "DEMO_ACCESS_MANAGED_TARGET_ADDRESS" : undefined,
    ].filter((value): value is string => value !== undefined);

    throw new Error(
      `Set all of ${formatEnvAddressNames()}, or leave all unset so seed:demo:local can use the demo-local Ignition deployment. Missing: ${missing.join(", ")}.`,
    );
  }

  const chainId = String(options.chainId);
  const projectRoot = options.projectRoot ?? process.cwd();
  const deploymentFile = join(projectRoot, "ignition", "deployments", `chain-${chainId}`, "deployed_addresses.json");

  if (!existsSync(deploymentFile)) {
    throw missingIgnitionDeploymentError(chainId, deploymentFile);
  }

  const deployedAddresses = readIgnitionDeploymentFile(deploymentFile);
  const isoCore = normalizeAddress(deployedAddresses[IGNITION_ADDRESS_KEYS.isoCore]);
  const isoProposals = normalizeAddress(deployedAddresses[IGNITION_ADDRESS_KEYS.isoProposals]);
  const demoTarget = normalizeAddress(deployedAddresses[IGNITION_ADDRESS_KEYS.demoTarget]);
  const demoVotesToken = normalizeAddress(deployedAddresses[IGNITION_ADDRESS_KEYS.demoVotesToken]);
  const demoOwnableTarget = normalizeAddress(deployedAddresses[IGNITION_ADDRESS_KEYS.demoOwnableTarget]);
  const demoAccessControlTarget = normalizeAddress(deployedAddresses[IGNITION_ADDRESS_KEYS.demoAccessControlTarget]);
  const demoAccessManager = normalizeAddress(deployedAddresses[IGNITION_ADDRESS_KEYS.demoAccessManager]);
  const demoAccessManagedTarget = normalizeAddress(deployedAddresses[IGNITION_ADDRESS_KEYS.demoAccessManagedTarget]);
  const missingKeys: string[] = [];
  if (isoCore === undefined) {
    missingKeys.push(IGNITION_ADDRESS_KEYS.isoCore);
  }
  if (isoProposals === undefined) {
    missingKeys.push(IGNITION_ADDRESS_KEYS.isoProposals);
  }
  if (demoTarget === undefined) {
    missingKeys.push(IGNITION_ADDRESS_KEYS.demoTarget);
  }
  if (demoOwnableTarget === undefined) {
    missingKeys.push(IGNITION_ADDRESS_KEYS.demoOwnableTarget);
  }
  if (demoAccessControlTarget === undefined) {
    missingKeys.push(IGNITION_ADDRESS_KEYS.demoAccessControlTarget);
  }
  if (demoAccessManager === undefined) {
    missingKeys.push(IGNITION_ADDRESS_KEYS.demoAccessManager);
  }
  if (demoAccessManagedTarget === undefined) {
    missingKeys.push(IGNITION_ADDRESS_KEYS.demoAccessManagedTarget);
  }

  if (missingKeys.length > 0) {
    throw new Error(
      `Ignition deployment file ${deploymentFile} is missing ${missingKeys.join(", ")}. Run \`corepack pnpm deploy:demo:local\` first, then run \`corepack pnpm seed:demo:local\`.`,
    );
  }

  return {
    isoCore: isoCore!,
    isoProposals: isoProposals!,
    demoTarget: demoTarget!,
    ...(demoVotesToken === undefined ? {} : { demoVotesToken }),
    demoOwnableTarget: demoOwnableTarget!,
    demoAccessControlTarget: demoAccessControlTarget!,
    demoAccessManager: demoAccessManager!,
    demoAccessManagedTarget: demoAccessManagedTarget!,
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
      `Could not read local Ignition deployment addresses from ${deploymentFile}: ${message}. Run \`corepack pnpm deploy:demo:local\` first, then run \`corepack pnpm seed:demo:local\`.`,
    );
  }
}

function missingIgnitionDeploymentError(chainId: string, deploymentFile: string): Error {
  return new Error(
    `No local Ignition deployment addresses found for chain ${chainId} at ${deploymentFile}. Run \`corepack pnpm deploy:demo:local\` first, then run \`corepack pnpm seed:demo:local\`, or set all of ${formatEnvAddressNames()}.`,
  );
}

function formatEnvAddressNames(): string {
  return ENV_ADDRESS_NAMES.join(", ");
}
