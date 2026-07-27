import assert from "node:assert/strict";
import test from "node:test";
import { copyLink, SHARE_LABELS, shareCard } from "../shareActions.ts";

function setGlobal(name: string, value: unknown): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  };
}

test("uses file sharing before the clipboard", async () => {
  const calls: string[] = [];
  const restoreNavigator = setGlobal("navigator", {
    canShare: () => true,
    share: async (data: ShareData) => {
      assert.equal(data.files?.[0]?.name, "pedaterre-PD-MN-1398-FY27.png");
      calls.push("share");
    },
    clipboard: {
      write: async () => calls.push("clipboard"),
    },
  });

  try {
    const result = await shareCard({
      png: new Blob(["png"], { type: "image/png" }),
      stamp: "PD-MN-1398-FY27",
    });
    assert.deepEqual(calls, ["share"]);
    assert.equal(result.method, "share");
  } finally {
    restoreNavigator();
  }
});

test("uses ClipboardItem when file sharing is unavailable", async () => {
  const written: unknown[] = [];
  class ClipboardItemMock {
    readonly data: Record<string, Blob>;

    constructor(data: Record<string, Blob>) {
      this.data = data;
    }
  }
  const restoreClipboardItem = setGlobal("ClipboardItem", ClipboardItemMock);
  const restoreNavigator = setGlobal("navigator", {
    clipboard: {
      write: async (items: unknown[]) => written.push(...items),
    },
  });

  try {
    const result = await shareCard({
      png: new Blob(["png"], { type: "image/png" }),
      stamp: "PD-SI-245-FY27",
    });
    assert.equal(written.length, 1);
    assert.equal(result.method, "clipboard");
    assert.equal(result.message, "On the clipboard.");
  } finally {
    restoreNavigator();
    restoreClipboardItem();
  }
});

test("downloads with the stamped filename as the final fallback", async () => {
  let downloaded = "";
  const anchor = {
    href: "",
    download: "",
    hidden: false,
    click() {
      downloaded = this.download;
    },
    remove() {},
  };
  const restoreNavigator = setGlobal("navigator", {});
  const restoreDocument = setGlobal("document", {
    createElement: (tag: string) => {
      assert.equal(tag, "a");
      return anchor;
    },
    body: { append() {} },
  });

  try {
    const result = await shareCard({
      png: new Blob(["png"], { type: "image/png" }),
      stamp: "PD-BK-3184-FY27",
    });
    assert.equal(result.method, "download");
    assert.equal(downloaded, "pedaterre-PD-BK-3184-FY27.png");
  } finally {
    restoreDocument();
    restoreNavigator();
  }
});

test("copyLink prefers clipboard text and returns the dry success copy", async () => {
  let copied = "";
  const restoreNavigator = setGlobal("navigator", {
    clipboard: { writeText: async (value: string) => (copied = value) },
  });
  try {
    const result = await copyLink("https://example.test/b/MN/1398");
    assert.equal(copied, "https://example.test/b/MN/1398");
    assert.equal(result.label, "Copy link");
    assert.equal(result.message, "On the clipboard.");
  } finally {
    restoreNavigator();
  }
});

test("copyLink falls back to a selected input", async () => {
  let selected = false;
  let removed = false;
  const input = {
    value: "",
    readOnly: false,
    style: {} as Record<string, string>,
    setAttribute() {},
    select() {
      selected = true;
    },
    setSelectionRange() {},
    remove() {
      removed = true;
    },
  };
  const restoreNavigator = setGlobal("navigator", {});
  const restoreDocument = setGlobal("document", {
    createElement: () => input,
    body: { append() {} },
    execCommand: (command: string) => command === "copy",
  });
  try {
    const result = await copyLink("https://example.test");
    assert.equal(selected, true);
    assert.equal(removed, true);
    assert.equal(result.method, "clipboard");
  } finally {
    restoreDocument();
    restoreNavigator();
  }
});

test("exports only the specified user-facing labels", () => {
  assert.deepEqual(SHARE_LABELS, {
    shareImage: "Share card image",
    copyLink: "Copy link",
    clipboardSuccess: "On the clipboard.",
  });
});
