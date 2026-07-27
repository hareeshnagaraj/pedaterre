export const SHARE_LABELS = Object.freeze({
  shareImage: "Share card image",
  copyLink: "Copy link",
  clipboardSuccess: "On the clipboard.",
} as const);

export interface ShareImagePayload {
  png: Blob | HTMLCanvasElement;
  stamp: string;
}

export interface ShareActionResult {
  method: "share" | "clipboard" | "download";
  label: string;
  message?: string;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The card image could not be encoded."));
    }, "image/png");
  });
}

async function pngBlob(payload: ShareImagePayload): Promise<Blob> {
  if (payload.png instanceof Blob) return payload.png;
  return canvasToBlob(payload.png);
}

function fileName(stamp: string): string {
  const safeStamp =
    stamp.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "card";
  return `pedaterre-${safeStamp}.png`;
}

function download(blob: Blob, name: string): void {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = name;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

export async function shareCard(
  payload: ShareImagePayload,
): Promise<ShareActionResult> {
  const blob = await pngBlob(payload);
  const name = fileName(payload.stamp);
  const file = new File([blob], name, { type: "image/png" });
  const shareData: ShareData = { files: [file], title: "pedaterre" };
  const canShareFiles =
    typeof navigator.share === "function" &&
    (typeof navigator.canShare !== "function" || navigator.canShare(shareData));

  if (canShareFiles) {
    try {
      await navigator.share(shareData);
      return { method: "share", label: SHARE_LABELS.shareImage };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
    }
  }

  const ClipboardItemConstructor = globalThis.ClipboardItem;
  if (
    ClipboardItemConstructor &&
    typeof navigator.clipboard?.write === "function"
  ) {
    await navigator.clipboard.write([
      new ClipboardItemConstructor({ "image/png": blob }),
    ]);
    return {
      method: "clipboard",
      label: SHARE_LABELS.shareImage,
      message: SHARE_LABELS.clipboardSuccess,
    };
  }

  download(blob, name);
  return { method: "download", label: SHARE_LABELS.shareImage };
}

export async function copyLink(url: string): Promise<ShareActionResult> {
  if (typeof navigator.clipboard?.writeText === "function") {
    await navigator.clipboard.writeText(url);
    return {
      method: "clipboard",
      label: SHARE_LABELS.copyLink,
      message: SHARE_LABELS.clipboardSuccess,
    };
  }

  const input = document.createElement("input");
  input.value = url;
  input.readOnly = true;
  input.setAttribute("aria-hidden", "true");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  input.setSelectionRange(0, input.value.length);

  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("The link could not be copied.");

  return {
    method: "clipboard",
    label: SHARE_LABELS.copyLink,
    message: SHARE_LABELS.clipboardSuccess,
  };
}
