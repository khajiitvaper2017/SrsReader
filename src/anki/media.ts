export function mediaType(name: string) {
  const extension = name.split(".").at(-1)?.toLowerCase();
  return (
    (
      {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        avif: "image/avif",
        svg: "image/svg+xml",
        mp3: "audio/mpeg",
        ogg: "audio/ogg",
        opus: "audio/ogg",
        wav: "audio/wav",
        m4a: "audio/mp4",
        mp4: "video/mp4",
        webm: "video/webm",
        ttf: "font/ttf",
        otf: "font/otf",
        woff: "font/woff",
        woff2: "font/woff2",
        css: "text/css",
        js: "text/javascript",
      } as Record<string, string>
    )[extension ?? ""] ?? "application/octet-stream"
  );
}
