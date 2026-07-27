import { access } from "node:fs/promises";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith(".") || /\.[a-z]+$/i.test(specifier)) throw error;

    for (const extension of [".ts", ".tsx"]) {
      const candidate = new URL(`${specifier}${extension}`, context.parentURL);
      try {
        await access(candidate);
        return { shortCircuit: true, url: candidate.href };
      } catch {
        // Try the next TypeScript extension.
      }
    }
    throw error;
  }
}
