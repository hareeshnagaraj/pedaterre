import { z } from "zod";
import { boroughNumber } from "./borough.ts";
import { blockPayloadSchema, type BlockPayload } from "./schema.ts";

export type BlockDataErrorCode = "BLOCK_MISSING" | "NETWORK";

export class BlockDataError extends Error {
  readonly code: BlockDataErrorCode;

  constructor(code: BlockDataErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BlockDataError";
    this.code = code;
  }
}

interface FetchBlockOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

const bucketSchema = z.record(blockPayloadSchema);
const bucketCache = new Map<string, z.infer<typeof bucketSchema>>();

export function clearBlockCache(): void {
  bucketCache.clear();
}

export function blockBucketPath(
  boroValue: string | number,
  block: number,
): string | null {
  const boro = boroughNumber(boroValue);
  if (!boro || !Number.isSafeInteger(block) || block < 0 || block > 99_999) {
    return null;
  }
  return `/data/buckets/${boro}/${Math.floor(block / 10)}.json`;
}

function missing(message: string): BlockDataError {
  return new BlockDataError("BLOCK_MISSING", message);
}

function network(message: string, cause?: unknown): BlockDataError {
  return new BlockDataError("NETWORK", message, { cause });
}

export async function fetchBlock(
  boroValue: string | number,
  block: number,
  options: FetchBlockOptions = {},
): Promise<BlockPayload> {
  const path = blockBucketPath(boroValue, block);
  if (!path) throw missing("The requested borough or block is invalid.");

  let bucket = bucketCache.get(path);
  if (!bucket) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new DOMException("Timed out", "TimeoutError")),
      options.timeoutMs ?? 8_000,
    );
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const response = await (options.fetcher ?? fetch)(path, {
        signal: controller.signal,
        cache: "force-cache",
      });
      if (response.status === 404) {
        throw missing(`No assessment bucket exists for block ${block}.`);
      }
      if (!response.ok) {
        throw network(
          `The assessment bucket request returned HTTP ${response.status}.`,
        );
      }
      bucket = bucketSchema.parse(await response.json());
      bucketCache.set(path, bucket);
    } catch (error) {
      if (error instanceof BlockDataError) throw error;
      throw network("The assessment bucket could not be loaded.", error);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  const payload = bucket[String(block)];
  if (!payload) throw missing(`Block ${block} is absent from its data bucket.`);
  return payload;
}
