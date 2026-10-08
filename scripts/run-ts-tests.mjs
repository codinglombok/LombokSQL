// Portable test launcher: `node --test <glob>` needs Node >= 21 and directory arguments differ
// between versions, so pass an explicit file list (works on Node 18+ and on Windows).
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "typescript", "dist-test", "test");
const files = readdirSync(dir).filter((f) => f.endsWith(".test.js")).map((f) => join(dir, f));
const coverage = process.argv.includes("--coverage");
// Node >= 22.8: fail when line coverage of the library sources is below 90%.
const flags = coverage ? ["--experimental-test-coverage", "--test-coverage-include=dist-test/src/**", "--test-coverage-lines=90"] : [];
const r = spawnSync(process.execPath, [...flags, "--test", ...files], { stdio: "inherit", cwd: join(dir, "..", "..") });
process.exit(r.status ?? 1);
