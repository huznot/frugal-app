// Builds the two deliverables from src/: index.html (9:16) and ../frugal-ad-wide (16:9).
import { readFileSync, writeFileSync, cpSync } from "node:fs";
const css = readFileSync("src/ad.css", "utf8");
const js = readFileSync("src/ad.js", "utf8");
const body = readFileSync("src/body.html", "utf8");
const page = (layout, w, h) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${w}, height=${h}" />
    <title>Frugal ad ${layout}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-layout="${layout}" data-start="0" data-duration="18" data-width="${w}" data-height="${h}">
${body}
    </div>
    <script>
${js}
    </script>
  </body>
</html>
`;
writeFileSync("index.html", page("tall", 1080, 1920));
// The 16:9 cut is its own project (one root composition per project).
writeFileSync("../frugal-ad-wide/index.html", page("wide", 1920, 1080));
cpSync("assets", "../frugal-ad-wide/assets", { recursive: true });
console.log("built index.html (1080x1920) + ../frugal-ad-wide/index.html (1920x1080)");
