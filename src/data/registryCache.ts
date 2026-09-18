import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Cache only immutable registry bytes, keyed and checked by the digest
 * from the freshly fetched versions.json. Never cache the mutable index. */
export async function registryBytes(directory: string, digest: string, download: () => Promise<Buffer>): Promise<Buffer> {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid registry SHA-256");
  const valid = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex") === digest;
  const file = join(directory, `${digest}.json`);
  try {
    const cached = await readFile(file);
    if (valid(cached)) return cached;
  } catch { /* Missing/unavailable cache: download and verify normally. */ }
  const bytes = await download();
  if (!valid(bytes)) throw new Error("Registry digest does not match versions.json");
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, bytes);
    await rename(temporary, file);
  } catch {
    // A read-only or full cache must not fail an otherwise verified build.
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
  return bytes;
}
