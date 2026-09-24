/**
 * Copies browser assets that ship inside npm packages into public/vendor, so
 * they are served by the app itself (no third-party CDN). Runs on postinstall.
 *
 * - zxing-wasm reader: the barcode engine used for camera scanning where the
 *   browser has no native BarcodeDetector (see features/scan/camera-scanner.tsx).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const zxingDir = join(root, "node_modules/zxing-wasm");
if (!existsSync(zxingDir)) process.exit(0); // dependency not installed (e.g. a partial install)

const { version } = JSON.parse(readFileSync(join(zxingDir, "package.json"), "utf8"));
const target = join(root, "public/vendor/zxing");
mkdirSync(target, { recursive: true });
copyFileSync(join(zxingDir, "dist/reader/zxing_reader.wasm"), join(target, `zxing_reader-${version}.wasm`));
