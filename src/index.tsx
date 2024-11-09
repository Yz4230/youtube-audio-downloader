import { load } from "cheerio";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { logger } from "hono/logger";
import { stream } from "hono/streaming";
import sanitize from "sanitize-filename";
import { z } from "zod";

const app = new Hono().use("*", logger());

app.get("/", (c) => {
  return c.html(
    <html>
      <head>
        <title>YouTube Audio Downloader</title>
        <link rel="stylesheet" href="styles.css" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body class="container mx-auto flex flex-col gap-2">
        <header class="h-10 px-4 flex items-center bg-gray-200">
          <h1 class="text-lg">YouTube Audio Downloader</h1>
        </header>
        <form action="/download" method="post" class="flex justify-center p-2">
          <input
            type="text"
            name="url"
            placeholder="YouTube Video URL"
            class="border p-2 w-full max-w-72"
            required
          />
          <button type="submit" class="bg-blue-500 text-white p-2">
            Download
          </button>
        </form>
      </body>
    </html>,
  );
});

app.post("/download", async (c) => {
  const body = await c.req.formData();
  const { data: url } = z.string().url().safeParse(body.get("url"));
  if (!url) return c.redirect("/");

  const title = await fetchVideoTitle(url);
  const sanitized = sanitize(title);

  const proc = Bun.spawn({
    cmd: ["yt-dlp", "--quiet", "-f", "ba[ext=m4a]", "-o", "-", url],
    stdout: "pipe",
  });

  c.header("Content-Type", "audio/m4a");
  c.header(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(sanitized)}.m4a`,
  );
  return stream(c, async (stream) => {
    stream.onAbort(() => proc.kill());
    await stream.pipe(proc.stdout);
    await proc.exited;
  });
});

app.use("*", serveStatic({ root: "public" }));

async function fetchVideoTitle(url: string) {
  const $ = await fetch(url)
    .then((res) => res.text())
    .then(load);
  const title = $("meta[name='title']").attr("content");
  if (title) return title;
  throw new Error("Failed to fetch video title");
}

export default app;
