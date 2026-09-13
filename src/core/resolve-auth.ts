import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type {
  AuthProfile,
  EnvironmentSecretReference,
  KeyVaultSecretReference,
  ProjectConfig,
  SecretReference,
} from "./project-config.js";

const execFileAsync = promisify(execFile);

export type ResolvedAuth =
  | {
      location: "header";
      name: string;
      value: string;
    }
  | {
      location: "query";
      name: string;
      value: string;
    };

export interface ResolveAuthOptions {
  env?: Readonly<Record<string, string | undefined>>;
  resolveKeyVaultSecret?: (secretName: string) => Promise<string>;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported auth profile: ${JSON.stringify(value)}`);
}

function resolveEnvironmentSecret(
  reference: EnvironmentSecretReference,
  profileName: string,
  env: Readonly<Record<string, string | undefined>>,
): string {
  const value = env[reference.env];

  if (value === undefined || value === "") {
    throw new Error(
      `Environment variable ${reference.env} for auth profile "${profileName}" must be set and non-empty`,
    );
  }

  return value;
}

async function runKeyVaultCommand(secretName: string): Promise<string> {
  const { stdout } = await execFileAsync("kv", [secretName], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });

  return stdout;
}

async function resolveKeyVaultReference(
  reference: KeyVaultSecretReference,
  profileName: string,
  resolver: (secretName: string) => Promise<string>,
): Promise<string> {
  let output: string;

  try {
    output = await resolver(reference.kv);
  } catch (cause: unknown) {
    throw new Error(
      `Failed to retrieve Key Vault secret "${reference.kv}" for auth profile "${profileName}"`,
      { cause },
    );
  }

  const value = output.replace(/[\r\n]+$/u, "");

  if (value === "") {
    throw new Error(
      `Key Vault secret "${reference.kv}" for auth profile "${profileName}" must be non-empty`,
    );
  }

  return value;
}

async function resolveSecretReference(
  reference: SecretReference,
  profileName: string,
  env: Readonly<Record<string, string | undefined>>,
  keyVaultResolver: (secretName: string) => Promise<string>,
): Promise<string> {
  if ("env" in reference) {
    return resolveEnvironmentSecret(reference, profileName, env);
  }

  return resolveKeyVaultReference(reference, profileName, keyVaultResolver);
}

export async function resolveAuth(
  profileName: string,
  config: ProjectConfig,
  options: ResolveAuthOptions = {},
): Promise<ResolvedAuth> {
  const profiles = config.auth;

  if (profiles === undefined || !Object.hasOwn(profiles, profileName)) {
    throw new Error(`Auth profile "${profileName}" was not found`);
  }

  const profile: AuthProfile | undefined = profiles[profileName];

  if (profile === undefined) {
    throw new Error(`Auth profile "${profileName}" was not found`);
  }

  const env = options.env ?? process.env;
  const keyVaultResolver =
    options.resolveKeyVaultSecret ?? runKeyVaultCommand;

  switch (profile.type) {
    case "bearer":
      return {
        location: "header",
        name: "Authorization",
        value: `Bearer ${await resolveSecretReference(
          profile.token,
          profileName,
          env,
          keyVaultResolver,
        )}`,
      };

    case "apiKey":
      return {
        location: profile.location,
        name: profile.name,
        value: await resolveSecretReference(
          profile.value,
          profileName,
          env,
          keyVaultResolver,
        ),
      };

    default:
      return assertNever(profile);
  }
}
