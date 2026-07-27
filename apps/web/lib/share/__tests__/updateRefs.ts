import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  REFERENCE_FIXTURES,
  referencePath,
  renderReference,
} from "./referenceHarness.ts";

for (const name of REFERENCE_FIXTURES) {
  const output = referencePath(name);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, (await renderReference(name)).png());
  process.stdout.write(`updated ${output}\n`);
}
