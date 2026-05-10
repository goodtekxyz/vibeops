import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(here, "..", "package.json");

interface PkgShape {
  version: string;
  name: string;
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as PkgShape;

export const VERSION: string = pkg.version;
export const NAME: string = pkg.name;
