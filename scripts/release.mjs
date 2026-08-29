// Cut a release: bump the version, tag it, and push — CI does the rest.
// Usage: npm run release [-- patch|minor|major|x.y.z]   (default: patch)
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "pipe" }).toString().trim();

const bump = process.argv[2] ?? "patch";

const status = run("git status --porcelain");
if (status) {
  console.error("Working tree is not clean — commit or discard changes first.");
  process.exit(1);
}

const branch = run("git rev-parse --abbrev-ref HEAD");
if (branch !== "master") {
  console.error(`Releases are cut from master (currently on ${branch}).`);
  process.exit(1);
}

execSync("git pull --ff-only", { stdio: "inherit" });
execSync(`npm version ${bump} -m "Release v%s"`, { stdio: "inherit" });
execSync("git push --follow-tags", { stdio: "inherit" });

const version = JSON.parse(run("git show HEAD:package.json")).version;
console.log(`\nPushed v${version} — the Release workflow is now building it:`);
console.log("https://github.com/haegemonia-ck3/ck3-tools/actions/workflows/release.yml");
