function isJsonContentType(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }

  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();

  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

export function formatResponseBody(
  body: Uint8Array,
  contentType: string | null,
): Uint8Array {
  if (!isJsonContentType(contentType)) {
    return body;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    const value: unknown = JSON.parse(text);
    const formatted = `${JSON.stringify(value, null, 2)}\n`;

    return new TextEncoder().encode(formatted);
  } catch {
    return body;
  }
}
