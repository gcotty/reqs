export interface EnvironmentSecretReference {
  env: string;
}

export interface KeyVaultSecretReference {
  kv: string;
}

export type SecretReference =
  EnvironmentSecretReference | KeyVaultSecretReference;

export interface BearerAuthProfile {
  type: "bearer";
  token: SecretReference;
}

export interface ApiKeyAuthProfile {
  type: "apiKey";
  location: "header" | "query";
  name: string;
  value: SecretReference;
}

export type AuthProfile = BearerAuthProfile | ApiKeyAuthProfile;

export interface ProjectConfig {
  version: 1;
  auth?: Record<string, AuthProfile>;
}
