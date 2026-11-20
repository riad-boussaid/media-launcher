import { type ReactNode, useEffect, useState } from "react";

// Some thumbnail hosts are permanently broken (expired certificate, removed
// media). Remember failures for the session so re-renders and remounts don't
// keep retrying the same URL and logging the same TLS error.
const failedThumbnails = new Set<string>();

export function isThumbnailFailed(src?: string | null): boolean {
  return Boolean(src && failedThumbnails.has(src));
}

export function markThumbnailFailed(src: string): void {
  failedThumbnails.add(src);
}

/**
 * Renders a remote thumbnail, falling back to caller-provided content when the
 * image cannot be loaded. Failed URLs are skipped for the rest of the session.
 */
export function Thumbnail({
  src,
  className,
  fallback,
}: {
  src?: string;
  className?: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(() => isThumbnailFailed(src));

  useEffect(() => {
    setFailed(isThumbnailFailed(src));
  }, [src]);

  if (!src || failed) return <>{fallback}</>;

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className}
      onError={() => {
        markThumbnailFailed(src);
        setFailed(true);
      }}
    />
  );
}
