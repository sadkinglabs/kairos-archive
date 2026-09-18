import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registryBytes } from "./registryCache";
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });
describe("verified registry cache", () => {
  it("reuses verified bytes across builds and fetches a changed release", async () => {
    const directory = await mkdtemp(join(tmpdir(), "registry-cache-")); directories.push(directory);
    const bytes = Buffer.from('{"cards":[]}');
    const digest = createHash("sha256").update(bytes).digest("hex");
    const download = vi.fn(async () => bytes);
    expect(await registryBytes(directory, digest, download)).toEqual(bytes);
    expect(await registryBytes(directory, digest, download)).toEqual(bytes);
    expect(download).toHaveBeenCalledTimes(1);
    const next = Buffer.from('{"cards":[1]}');
    const nextDigest = createHash("sha256").update(next).digest("hex");
    expect(await registryBytes(directory, nextDigest, async () => next)).toEqual(next);
  });
  it("repairs corrupt cache entries and rejects corrupt downloads", async () => {
    const directory = await mkdtemp(join(tmpdir(), "registry-cache-")); directories.push(directory);
    const bytes = Buffer.from("verified");
    const digest = createHash("sha256").update(bytes).digest("hex");
    await writeFile(join(directory, `${digest}.json`), "corrupt");
    await expect(registryBytes(directory, digest, async () => Buffer.from("wrong"))).rejects.toThrow("digest");
    expect(await registryBytes(directory, digest, async () => bytes)).toEqual(bytes);
    await expect(registryBytes(directory, "../escape", async () => bytes)).rejects.toThrow("SHA-256");
  });
});
