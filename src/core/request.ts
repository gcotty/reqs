export type HttpMethod =
  "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type RequestBody =
  | {
      type: "json";
      value: JsonValue;
    }
  | {
      type: "text";
      value: string;
    }
  | {
      type: "form";
      fields: Record<string, string>;
    }
  | {
      type: "file";
      path: string;
    };

export interface RequestDefinition {
  version: 1;
  method: HttpMethod;
  url: string;
  auth?: string;
  vars?: Record<string, JsonValue>;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string>;
  body?: RequestBody;
}
