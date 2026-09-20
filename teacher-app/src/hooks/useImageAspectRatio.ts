import { useEffect, useState } from "react";
import { Image } from "react-native";

const aspectCache = new Map<string, number>();

export function getCachedImageAspectRatio(uri: string | null | undefined) {
  if (!uri) return null;
  return aspectCache.get(uri) ?? null;
}

export function probeImageAspectRatio(
  uri: string,
  onReady?: (ratio: number) => void
) {
  if (aspectCache.has(uri)) {
    onReady?.(aspectCache.get(uri)!);
    return;
  }
  Image.getSize(
    uri,
    (width, height) => {
      if (width > 0 && height > 0) {
        const ratio = width / height;
        aspectCache.set(uri, ratio);
        onReady?.(ratio);
      }
    },
    () => {}
  );
}

/** Returns width / height once the image dimensions are known. */
export function useImageAspectRatio(uri: string | null | undefined) {
  const [ratio, setRatio] = useState<number | null>(() =>
    uri ? getCachedImageAspectRatio(uri) : null
  );

  useEffect(() => {
    if (!uri) {
      setRatio(null);
      return;
    }
    const cached = getCachedImageAspectRatio(uri);
    if (cached != null) {
      setRatio(cached);
      return;
    }
    let cancelled = false;
    probeImageAspectRatio(uri, (next) => {
      if (!cancelled) setRatio(next);
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  return ratio;
}

/** Landscape ID card when width >= height. */
export function isLandscapeAspectRatio(ratio: number | null): boolean {
  if (ratio == null) return false;
  return ratio >= 1;
}
