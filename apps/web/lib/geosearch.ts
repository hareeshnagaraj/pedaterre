const GEOSEARCH_ORIGIN = "https://geosearch.planninglabs.nyc";
const GEOSEARCH_TIMEOUT_MS = 8_000;

export interface ParsedBbl {
  boro: number;
  block: number;
  lot: number;
  canonical: string;
}

export interface GeoSearchSuggestion {
  id: string;
  label: string;
}

interface GeoSearchFeature {
  properties?: {
    gid?: unknown;
    label?: unknown;
    name?: unknown;
    addendum?: {
      pad?: {
        bbl?: unknown;
      };
    };
  };
}

interface GeoSearchResponse {
  features?: GeoSearchFeature[];
}

interface GeoSearchOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export class GeoSearchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GeoSearchError";
  }
}

function canonicalBbl(boro: number, block: number, lot: number): ParsedBbl {
  return {
    boro,
    block,
    lot,
    canonical: `${boro}-${String(block).padStart(5, "0")}-${String(lot).padStart(4, "0")}`,
  };
}

export function parseBbl(value: unknown): ParsedBbl | null {
  const input = String(value ?? "").trim();
  let boro: number;
  let block: number;
  let lot: number;

  if (/^\d{10}$/.test(input)) {
    boro = Number(input.slice(0, 1));
    block = Number(input.slice(1, 6));
    lot = Number(input.slice(6, 10));
  } else {
    const match = /^([1-5])\s*-\s*(\d{1,5})\s*-\s*(\d{1,4})$/.exec(
      input,
    );
    if (!match) return null;
    boro = Number(match[1]);
    block = Number(match[2]);
    lot = Number(match[3]);
  }

  if (
    boro < 1 ||
    boro > 5 ||
    !Number.isSafeInteger(block) ||
    block < 0 ||
    block > 99_999 ||
    !Number.isSafeInteger(lot) ||
    lot < 0 ||
    lot > 9_999
  ) {
    return null;
  }
  return canonicalBbl(boro, block, lot);
}

function featureLabel(feature: GeoSearchFeature): string | null {
  const label = feature.properties?.label;
  if (typeof label === "string" && label.trim()) return label.trim();
  const name = feature.properties?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function bblFromFeature(feature: GeoSearchFeature): ParsedBbl | null {
  return parseBbl(feature.properties?.addendum?.pad?.bbl);
}

async function request(
  endpoint: "autocomplete" | "search",
  query: string,
  options: GeoSearchOptions,
): Promise<GeoSearchResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Timed out", "TimeoutError")),
    options.timeoutMs ?? GEOSEARCH_TIMEOUT_MS,
  );
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const url = new URL(`/v2/${endpoint}`, GEOSEARCH_ORIGIN);
    url.searchParams.set("text", query);
    const response = await (options.fetcher ?? fetch)(url, {
      signal: controller.signal,
      headers: { Accept: "application/geo+json, application/json" },
    });
    if (!response.ok) {
      throw new GeoSearchError(`GeoSearch returned HTTP ${response.status}.`);
    }
    const payload = (await response.json()) as GeoSearchResponse;
    return Array.isArray(payload.features) ? payload : { features: [] };
  } catch (error) {
    if (error instanceof GeoSearchError) throw error;
    throw new GeoSearchError("GeoSearch did not return an address record.", {
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function autocompleteAddress(
  query: string,
  options: GeoSearchOptions = {},
): Promise<GeoSearchSuggestion[]> {
  if (query.trim().length < 3 || parseBbl(query)) return [];
  const payload = await request("autocomplete", query.trim(), options);
  return (payload.features ?? []).flatMap((feature, index) => {
    const label = featureLabel(feature);
    if (!label) return [];
    const gid = feature.properties?.gid;
    return [
      {
        id: typeof gid === "string" && gid ? gid : `${label}-${index}`,
        label,
      },
    ];
  });
}

export async function searchAddress(
  query: string,
  options: GeoSearchOptions = {},
): Promise<ParsedBbl | null> {
  const direct = parseBbl(query);
  if (direct) return direct;
  if (query.trim().length < 3) return null;
  const payload = await request("search", query.trim(), options);
  for (const feature of payload.features ?? []) {
    const bbl = bblFromFeature(feature);
    if (bbl) return bbl;
  }
  return null;
}
