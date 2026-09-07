import type {
  HttpMethod,
  JsonValue,
  RequestBody,
  RequestDefinition,
} from "./request.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isRecordOf<T>(
  value: unknown,
  check: (entry: unknown) => entry is T,
): value is Record<string, T> {
  return isObject(value) && Object.values(value).every(check);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isRecordOf(value, isJsonValue);
}

function isQueryValue(value: unknown): value is string | string[] {
  return isString(value) || (Array.isArray(value) && value.every(isString));
}

function isHttpMethod(value: unknown): value is HttpMethod {
  switch (value) {
    case "GET":
    case "HEAD":
    case "POST":
    case "PUT":
    case "PATCH":
    case "DELETE":
    case "OPTIONS":
      return true;
    default:
      return false;
  }
}

function isRequestBody(value: unknown): value is RequestBody {
  if (!isObject(value)) {
    return false;
  }

  switch (value["type"]) {
    case "json":
      return isJsonValue(value["value"]);
    case "text":
      return isString(value["value"]);
    case "form":
      return isRecordOf(value["fields"], isString);
    case "file":
      return isString(value["path"]);
    default:
      return false;
  }
}

function validateRequst(value: unknown): RequestDefinition {
  if (!isObject(value)) {
    throw new Error("Request must be a JSON object");
  }

  if (value["version"] !== 1) {
    throw new Error("Request version must be 1");
  }

  if (!isHttpMethod(value["method"])) {
    throw new Error("Request method must be a supported HTTP method");
  }

  if (!isString(value["url"]) || value["url"].trim() === "") {
    throw new Error("Request url must be a non-empty string");
  }

  const request: RequestDefinition = {
    version: 1,
    method: value["method"],
    url: value["url"],
  };

  if ("auth" in value) {
    if (!isString(value["auth"])) {
      throw new Error("Request auth must be a profile name");
    }
    request.auth = value["auth"];
  }

  if ("vars" in value) {
    if (!isRecordOf(value["vars"], isJsonValue)) {
      throw new Error("Request vars must be an object containing JSON values");
    }
    request.vars = value["vars"];
  }

  if ("headers" in value) {
    if (!isRecordOf(value["headers"], isString)) {
      throw new Error("Request headers must be an object containing strings");
    }
    request.headers = value["headers"];
  }

  if ("query" in value) {
    if (!isRecordOf(value["query"], isQueryValue)) {
      throw new Error(
        "Request query values must be strings or arrays of strings",
      );
    }
    request.query = value["query"];
  }

  if ("body" in value) {
    if (!isRequestBody(value["body"])) {
      throw new Error("Request body must match a supported body type");
    }
    request.body = value["body"];
  }

  return request;
}
