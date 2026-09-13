import type {
  AuthProfile,
  EnvironmentSecretReference,
  ProjectConfig,
} from "./project-config.js";

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

  switch (profile.type) {
    case "bearer":
      return {
        location: "header",
        name: "Authorization",
        value: `Bearer ${resolveEnvironmentSecret(
          profile.token,
          profileName,
          env,
        )}`,
      };

    case "apiKey":
      return {
        location: profile.location,
        name: profile.name,
        value: resolveEnvironmentSecret(
          profile.value,
          profileName,
          env,
        ),
      };

    default:
      return assertNever(profile);
  }
}
