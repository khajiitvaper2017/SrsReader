import { readFile, writeFile } from "node:fs/promises";
import { ColorSchemeScript } from "@mantine/core";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { App, paths, titleFor } from "./App";

const template = await readFile("dist/index.html", "utf8");
const colorSchemeScript = renderToString(
  <ColorSchemeScript defaultColorScheme="auto" />,
);

for (const path of paths) {
  const page = renderToString(
    <Router ssrPath={path}>
      <App />
    </Router>,
  );
  const html = template
    .replace("<head>", `<head>${colorSchemeScript}`)
    .replace("<title>SrsReader</title>", `<title>${titleFor(path)}</title>`)
    .replace(
      '<div id="root"></div>',
      () => `<div id="root" data-path="${path}">${page}</div>`,
    );
  await writeFile(path === "/" ? "dist/index.html" : `dist${path}.html`, html);
}
