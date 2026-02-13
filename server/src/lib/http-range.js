export function parseRangeHeader(rawRange, size) {
  if (!Number.isInteger(size) || size <= 0) {
    return null;
  }

  if (typeof rawRange !== "string" || !rawRange.startsWith("bytes=")) {
    return null;
  }

  const value = rawRange.slice("bytes=".length).trim();
  const [startPart, endPart, ...rest] = value.split("-");
  if (rest.length > 0) {
    return null;
  }

  if (!startPart && !endPart) {
    return null;
  }

  let start = null;
  let end = null;

  if (startPart) {
    start = Number(startPart);
    if (!Number.isInteger(start) || start < 0) {
      return null;
    }
  }

  if (endPart) {
    end = Number(endPart);
    if (!Number.isInteger(end) || end < 0) {
      return null;
    }
  }

  if (start == null && end != null) {
    const suffixLength = Math.min(end, size);
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else if (start != null && end == null) {
    end = size - 1;
  }

  if (start == null || end == null) {
    return null;
  }

  if (start >= size || end < start) {
    return null;
  }

  if (end >= size) {
    end = size - 1;
  }

  return { start, end };
}
