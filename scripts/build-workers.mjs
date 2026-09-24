#!/usr/bin/env node
/**
 * Bundles the background workers (Tally sync, notifications + webhooks) into
 * self-contained ESM files that run with a release's own node_modules:
 *   npm run build:workers                # -> dist/workers/*.mjs
 *   node scripts/build-workers.mjs <dir> # used by deploy/deploy.sh
 * Prisma stays external (its engine is resolved at runtime).
 */
import { build } from "esbuild";

const WORKERS = ["tally-sync", "notify"];
const outdir = process.argv[2] ?? "dist/workers";

await Promise.all(
  WORKERS.map((worker) =>
    build({
      entryPoints: [`scripts/${worker}.ts`],
      outfile: `${outdir}/${worker}.mjs`,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      tsconfig: "tsconfig.json",
      external: ["@prisma/client", ".prisma/client", "pg-native"],
      // Some bundled CommonJS dependencies (e.g. nodemailer) call require().
      banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
      logLevel: "warning",
    }),
  ),
);
console.log(`Bundled ${WORKERS.join(", ")} into ${outdir}/`);
