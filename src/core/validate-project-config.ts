import type {
  AuthProfile,
  ProjectConfig,
  SecretReference,
} from "./project-config.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function validateSecretReference(
  value: unknown,
  description: string,
): SecretReference {
  if (!isObject(value)) {
    throw new Error(`${description} must contain exactly one of "env" or "kv"`);
  }

  const hasEnv = Object.hasOwn(value, "env");
  const hasKv = Object.hasOwn(value, "kv");

  if (hasEnv === hasKv) {
    throw new Error(`${description} must contain exactly one of "env" or "kv"`);
  }

  if (hasEnv) {
    if (!isNonEmptyString(value["env"])) {
      throw new Error(
        `${description} must reference a non-empty environment variable`,
      );
    }

    return {
      env: value["env"],
    };
  }

  if (!isNonEmptyString(value["kv"])) {
    throw new Error(
      `${description} must reference a non-empty Key Vault secret name`,
    );
  }

  return {
    kv: value["kv"],
  };
}

function validateAuthProfile(profileName: string, value: unknown): AuthProfile {
  if (!isObject(value)) {
    throw new Error(`Auth profile "${profileName}" must be an object`);
  }

  switch (value["type"]) {
    case "bearer":
      return {
        type: "bearer",
        token: validateSecretReference(
          value["token"],
          `Auth profile "${profileName}" token`,
        ),
      };

    case "apiKey": {
      const location = value["location"];

      if (location !== "header" && location !== "query") {
        throw new Error(
          `Auth profile "${profileName}" location must be "header" or "query"`,
        );
      }

      if (!isNonEmptyString(value["name"])) {
        throw new Error(
          `Auth profile "${profileName}" name must be a non-empty string`,
        );
      }

      return {
        type: "apiKey",
        location,
        name: value["name"],
        value: validateSecretReference(
          value["value"],
          `Auth profile "${profileName}" value`,
        ),
      };
    }

    default:
      throw new Error(`Auth profile "${profileName}" has an unsupported type`);
  }
}

export function validateProjectConfig(value: unknown): ProjectConfig {
  if (!isObject(value)) {
    throw new Error("Project config must be a JSON object");
  }

  if (value["version"] !== 1) {
    throw new Error("Project config version must be 1");
  }

  const config: ProjectConfig = {
    version: 1,
  };

  if ("auth" in value) {
    if (!isObject(value["auth"])) {
      throw new Error("Project config auth must be an object");
    }

    const authEntries: [string, AuthProfile][] = Object.entries(
      value["auth"],
    ).map(([profileName, profileValue]) => {
      if (profileName.trim() === "") {
        throw new Error("Auth profile names must be non-empty");
      }

      return [profileName, validateAuthProfile(profileName, profileValue)];
    });

    config.auth = Object.fromEntries(authEntries);
  }

  return config;
}
