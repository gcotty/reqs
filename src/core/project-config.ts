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

export interface OAuth2ClientCredentialsAuthProfile {
  type: "oauth2ClientCredentials";
  tokenUrl: string;
  scope: string;
  clientId: SecretReference;
  clientSecret: SecretReference;
}

export type AuthProfile =
  | BearerAuthProfile
  | ApiKeyAuthProfile
  | OAuth2ClientCredentialsAuthProfile;

export interface ProjectConfig {
  version: 1;
  auth?: Record<string, AuthProfile>;
}
