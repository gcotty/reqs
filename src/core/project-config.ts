export interface EnvironmentSecretReference {
  env: string;
}

export interface BearerAuthProfile {
  type: "bearer";
  token: EnvironmentSecretReference;
}

export interface ApiKeyAuthProfile {
  type: "apiKey";
  location: "header" | "query";
  name: string;
  value: EnvironmentSecretReference;
}

export type AuthProfile = BearerAuthProfile | ApiKeyAuthProfile;

export interface ProjectConfig {
  version: 1;
  auth?: Record<string, AuthProfile>;
}
