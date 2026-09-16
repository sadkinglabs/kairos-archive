import { describe, expect, it } from "vitest";
import { formatBytes } from "./bytes";

describe("formatBytes", () => {
  it("states bytes, kilobytes and megabytes", () => {
    expect(formatBytes(80)).toBe("80 B");
    expect(formatBytes(459160)).toBe("448 KB");
    expect(formatBytes(6429254)).toBe("6.1 MB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });
});
