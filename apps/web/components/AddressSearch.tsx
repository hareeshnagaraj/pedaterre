"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  EmptyState,
  LoadingState,
  SearchErrorState,
} from "@/components/states";
import {
  autocompleteAddress,
  parseBbl,
  searchAddress,
  type GeoSearchSuggestion,
} from "@/lib/geosearch";

type SearchView =
  | { state: "idle" }
  | { state: "loading"; query: string }
  | { state: "empty"; query: string }
  | { state: "error"; query: string };

export function AddressSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRequestRef = useRef<AbortController | null>(null);
  const submitRequestRef = useRef<AbortController | null>(null);
  const noticeFocusRef = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeoSearchSuggestion[]>([]);
  const [suggestionState, setSuggestionState] = useState<
    "idle" | "loading" | "ready" | "empty" | "error"
  >("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<SearchView>({ state: "idle" });
  const listboxId = useId();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "bbl") {
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    autocompleteRequestRef.current?.abort();
    const trimmed = query.trim();
    if (view.state === "loading" || trimmed.length < 3 || parseBbl(trimmed)) {
      setSuggestions([]);
      setSuggestionState("idle");
      setActiveIndex(-1);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    autocompleteRequestRef.current = controller;
    setSuggestionState("loading");
    const timer = window.setTimeout(async () => {
      try {
        const matches = await autocompleteAddress(trimmed, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setSuggestions(matches);
        setSuggestionState(matches.length ? "ready" : "empty");
        setActiveIndex(-1);
        setOpen(true);
      } catch {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setSuggestionState("error");
        setOpen(true);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, view.state]);

  useEffect(
    () => () => {
      autocompleteRequestRef.current?.abort();
      submitRequestRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (view.state === "empty" || view.state === "error") {
      noticeFocusRef.current?.focus();
    }
  }, [view.state]);

  async function resolve(nextQuery: string) {
    const submitted = nextQuery.trim();
    if (!submitted || view.state === "loading") return;
    autocompleteRequestRef.current?.abort();
    submitRequestRef.current?.abort();
    const controller = new AbortController();
    submitRequestRef.current = controller;
    setOpen(false);
    setView({ state: "loading", query: submitted });

    try {
      const bbl = await searchAddress(submitted, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!bbl) {
        setView({ state: "empty", query: submitted });
        submitRequestRef.current = null;
        return;
      }
      router.push(`/b/${bbl.boro}/${bbl.block}?lot=${bbl.lot}`);
    } catch {
      if (!controller.signal.aborted) {
        setView({ state: "error", query: submitted });
      }
    } finally {
      if (submitRequestRef.current === controller) {
        submitRequestRef.current = null;
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void resolve(query);
  }

  function selectSuggestion(suggestion: GeoSearchSuggestion) {
    setQuery(suggestion.label);
    setSuggestions([]);
    setActiveIndex(-1);
    setOpen(false);
    void resolve(suggestion.label);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!open || !suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (index) => (index <= 0 ? suggestions.length - 1 : index - 1),
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    }
  }

  const activeOption =
    open && activeIndex >= 0
      ? `${listboxId}-option-${activeIndex}`
      : undefined;
  const describedBy =
    view.state === "empty" || view.state === "error"
      ? `${listboxId}-notice`
      : `${listboxId}-help`;

  return (
    <div className="address-search" id="lookup">
      <form className="address-form" onSubmit={submit} role="search">
        <label htmlFor={`${listboxId}-input`}>NYC address or BBL</label>
        <div className="combobox-wrap">
          <input
            ref={inputRef}
            id={`${listboxId}-input`}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={activeOption}
            aria-describedby={describedBy}
            aria-busy={suggestionState === "loading"}
            autoComplete="street-address"
            inputMode="search"
            placeholder="41-53 Fulton St or 1-01398-1010"
            value={query}
            disabled={view.state === "loading"}
            onChange={(event) => {
              setQuery(event.target.value);
              if (view.state !== "idle") setView({ state: "idle" });
            }}
            onFocus={() => {
              if (suggestionState !== "idle") setOpen(true);
            }}
            onKeyDown={keyDown}
          />
          {open ? (
            <ul id={listboxId} role="listbox" aria-label="Address suggestions">
              {suggestions.map((suggestion, index) => (
                <li
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  key={suggestion.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectSuggestion(suggestion)}
                >
                  {suggestion.label}
                </li>
              ))}
              {!suggestions.length ? (
                <li className="combobox-notice" role="presentation">
                  {suggestionState === "loading"
                    ? "CHECKING THE ADDRESS FILE…"
                    : suggestionState === "error"
                      ? "ADDRESS INDEX UNAVAILABLE — submit to retry"
                      : "NO SUGGESTIONS ON FILE — submit the full address"}
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
        <button type="submit" disabled={view.state === "loading"}>
          LOOK UP THE BLOCK
        </button>
      </form>
      <p className="search-help" id={`${listboxId}-help`}>
        Raw BBLs work too: borough, five-digit block, four-digit lot.
      </p>

      <div className="search-state" id={`${listboxId}-notice`}>
        {view.state === "loading" ? (
          <LoadingState submittedAddress={view.query} />
        ) : view.state === "empty" ? (
          <EmptyState query={view.query} focusTargetRef={noticeFocusRef} />
        ) : view.state === "error" ? (
          <SearchErrorState
            query={view.query}
            focusTargetRef={noticeFocusRef}
            onRetry={() => void resolve(view.query)}
            onSearch={(nextQuery) => {
              setQuery(nextQuery);
              void resolve(nextQuery);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
