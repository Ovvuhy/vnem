#!/usr/bin/env node
import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const documentsDir = path.resolve(rootDir, "..");
const outputDir = path.resolve(process.env.VNEM_BROWSER_BENCHMARK_OUTPUT || path.join(rootDir, "output", "visual-browser"));
const userArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const envDirs = (process.env.VNEM_VISUAL_ARTIFACTS || "")
  .split(path.delimiter)
  .map((item) => item.trim())
  .filter(Boolean);
const defaultDirs = [
  path.join(documentsDir, "vnemtest1"),
  path.join(documentsDir, "novnemtest1"),
  path.join(documentsDir, "vnem test 1"),
  path.join(documentsDir, "no vnem test 1"),
  path.join(documentsDir, "vnem test 2"),
  path.join(documentsDir, "no vnem test 2")
];
const candidateDirs = uniqueStrings([...userArgs, ...envDirs, ...defaultDirs].map((item) => path.resolve(item)));
const dirs = candidateDirs.filter((dir) => existsSync(dir));
const browserPath = process.env.VNEM_BROWSER_PATH || findBrowser();

async function main() {
  if (!dirs.length) {
    console.log("vnem visual browser benchmark");
    console.log("No artifact folders found. Pass folders as arguments or set VNEM_VISUAL_ARTIFACTS.");
    console.log("Example: npm run benchmark:visual:browser -- ../vnemtest1 ../novnemtest1");
    return;
  }

  if (!browserPath) {
    console.log("vnem visual browser benchmark");
    console.log("No Chrome-compatible browser found. Set VNEM_BROWSER_PATH to a Chrome, Chromium, Edge, or Brave executable.");
    return;
  }

  await mkdir(outputDir, { recursive: true });
  const browser = await launchBrowser(browserPath);
  const results = [];

  try {
    for (const dir of dirs) {
      const result = await scoreBrowserArtifact(dir, browser.port);
      results.push(result);
    }
  } finally {
    browser.close();
  }

  console.log("vnem visual browser benchmark");
  console.log(`Browser: ${browserPath}`);
  console.log(`Screenshots: ${outputDir}`);
  for (const result of results) {
    console.log(`- ${path.basename(result.dir)}: ${result.score}%`);
    for (const check of result.checks) {
      const status = check.ok ? "pass" : "miss";
      console.log(`  ${status} ${check.id}: ${check.reason}`);
    }
    if (result.screenshots.length) {
      console.log(`  screenshots: ${result.screenshots.map((item) => path.relative(rootDir, item)).join(", ")}`);
    }
    if (result.risks.length) {
      console.log(`  risks: ${result.risks.join("; ")}`);
    }
  }

  const ranked = [...results].sort((a, b) => b.score - a.score || a.dir.localeCompare(b.dir));
  if (ranked.length > 1) {
    console.log(`Top artifact: ${path.basename(ranked[0].dir)} (${ranked[0].score}%)`);
  }
}

async function scoreBrowserArtifact(dir, port) {
  const files = await walk(dir);
  const htmlFile = chooseHtml(files, dir);
  const codeFiles = files.filter((file) => /\.(html|css|js|mjs|jsx|ts|tsx)$/i.test(file));
  const codeText = (await Promise.all(codeFiles.map((file) => readFile(file, "utf8").catch(() => "")))).join("\n");
  const isGameLike = /\b(canvas|snake|game|score|apple|collect|collision|requestanimationframe)\b/i.test(codeText);
  const staticReducedMotion = /prefers-reduced-motion|reduceMotion|reducedMotion/i.test(codeText);
  const staticAnchoredReward = anchoredReward(codeText);
  const staticHasAudio = /\.(mp3|wav|ogg|m4a)$/i.test(files.join("\n")) || /\b(AudioContext|HTMLAudioElement|new Audio|oscillator|gainNode|audio)\b/i.test(codeText);

  if (!htmlFile) {
    return {
      dir,
      score: 0,
      checks: [check("entrypoint", false, "no HTML entrypoint was found")],
      screenshots: [],
      risks: ["browser benchmark currently expects a static HTML entrypoint"]
    };
  }

  const server = await serveStatic(dir);
  const relativeHtml = path.relative(dir, htmlFile).split(path.sep).map(encodeURIComponent).join("/");
  const url = `http://127.0.0.1:${server.port}/${relativeHtml}?debug=1`;
  const slug = safeSlug(path.basename(dir));
  const screenshots = [];

  try {
    const desktop = await inspectViewport(port, url, {
      name: "desktop",
      width: 1440,
      height: 960,
      mobile: false,
      screenshotPath: path.join(outputDir, `${slug}-desktop.png`)
    });
    screenshots.push(desktop.screenshotPath);

    const mobile = await inspectViewport(port, url, {
      name: "mobile",
      width: 390,
      height: 844,
      mobile: true,
      screenshotPath: path.join(outputDir, `${slug}-mobile.png`)
    });
    screenshots.push(mobile.screenshotPath);

    const reward = await inspectRewardMoment(port, url, {
      width: 1440,
      height: 960,
      screenshotPath: path.join(outputDir, `${slug}-reward.png`)
    });
    if (reward.screenshotPath) screenshots.push(reward.screenshotPath);

    const checks = [
      check("desktop_screenshot", desktop.screenshotBytes > 2000, "desktop screenshot was captured and is non-empty"),
      check("mobile_screenshot", mobile.screenshotBytes > 2000, "mobile screenshot was captured and is non-empty"),
      check("nonblank_canvas", !isGameLike || desktop.metrics.canvasNonblank, "game/canvas output has visible pixels in the real browser"),
      check("mobile_fit", mobile.metrics.horizontalOverflow <= 4 && mobile.metrics.maxRightOverflow <= 12, "mobile viewport has no meaningful horizontal overflow"),
      check("canvas_bounds", !isGameLike || canvasFits(mobile.metrics), "game/canvas playfield fits the mobile viewport"),
      check("text_overflow", desktop.metrics.textOverflowCount === 0 && mobile.metrics.textOverflowCount === 0, "visible text does not overflow its boxes"),
      check("tap_targets", mobile.metrics.smallTapTargets <= 1, "mobile controls are not mostly tiny tap targets"),
      check("reward_moment", !isGameLike || reward.scoreChanged || reward.flashActivated || reward.screenshotChanged, "one reward/interaction moment was observed or visibly changed"),
      check("anchored_reward", !isGameLike || staticAnchoredReward || reward.flashAnchored, "reward flash/effects are anchored to event or object coordinates"),
      check("reduced_motion", !hasMotion(codeText) || staticReducedMotion || desktop.metrics.reduceMotionMentions, "motion-heavy artifact includes reduced-motion handling"),
      check("audio_mute", !staticHasAudio || desktop.metrics.hasMuteControl, "audio work exposes a mute/sound control")
    ];

    const risks = [];
    if (isGameLike && !(staticAnchoredReward || reward.flashAnchored)) {
      risks.push("reward or screen flash appears global/centered instead of event-anchored");
    }
    if (mobile.metrics.textOverflowCount > 0) {
      risks.push(`${mobile.metrics.textOverflowCount} visible text element(s) overflow on mobile`);
    }
    if (isGameLike && !canvasFits(mobile.metrics)) {
      risks.push("canvas/playfield may be too large for mobile first view");
    }
    if (staticHasAudio && !desktop.metrics.hasMuteControl) {
      risks.push("audio appears present without an obvious mute/sound control");
    }

    return {
      dir,
      score: Math.round((checks.filter((item) => item.ok).length / checks.length) * 100),
      checks,
      screenshots,
      risks
    };
  } finally {
    await server.close();
  }
}

async function inspectViewport(port, url, options) {
  const page = await openPage(port);
  try {
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: options.width,
      height: options.height,
      deviceScaleFactor: options.mobile ? 2 : 1,
      mobile: options.mobile
    });
    await page.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
    });
    await navigate(page, url);
    await wait(page, 750);
    const metrics = await evaluate(page, browserMetricsSource());
    const screenshotBytes = await screenshot(page, options.screenshotPath);
    return {
      metrics,
      screenshotPath: options.screenshotPath,
      screenshotBytes
    };
  } finally {
    await page.close();
  }
}

async function inspectRewardMoment(port, url, options) {
  const page = await openPage(port);
  try {
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: options.width,
      height: options.height,
      deviceScaleFactor: 1,
      mobile: false
    });
    await navigate(page, url);
    await wait(page, 750);
    const beforeScore = await evaluate(page, scoreSource());
    const beforeScreenshot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await evaluate(page, rewardTriggerSource());
    await wait(page, 950);
    const afterScore = await evaluate(page, scoreSource());
    const rewardMetrics = await evaluate(page, rewardMetricsSource());
    const afterScreenshot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const buffer = Buffer.from(afterScreenshot.data, "base64");
    await writeFile(options.screenshotPath, buffer);
    const screenshotChanged = Boolean(beforeScreenshot?.data && afterScreenshot?.data && beforeScreenshot.data !== afterScreenshot.data);
    return {
      screenshotPath: options.screenshotPath,
      screenshotBytes: buffer.length,
      scoreChanged: Number(afterScore || 0) > Number(beforeScore || 0),
      flashActivated: Boolean(rewardMetrics?.flashActivated),
      flashAnchored: Boolean(rewardMetrics?.flashAnchored),
      screenshotChanged
    };
  } finally {
    await page.close();
  }
}

function browserMetricsSource() {
  return `(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const elements = [...document.querySelectorAll("body *")].filter(visible);
    const textElements = elements.filter((el) => (el.innerText || "").trim().length > 0);
    const textOverflow = textElements.filter((el) => el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2);
    const maxRightOverflow = Math.max(0, ...elements.map((el) => el.getBoundingClientRect().right - innerWidth));
    const horizontalOverflow = Math.max(0, document.documentElement.scrollWidth - innerWidth, document.body.scrollWidth - innerWidth);
    const tapTargets = [...document.querySelectorAll("button, a, input, select, textarea, [role=button], [tabindex]")].filter(visible);
    const smallTapTargets = tapTargets.filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width < 36 || rect.height < 36;
    }).length;
    const canvases = [...document.querySelectorAll("canvas")].filter(visible).map((canvas) => {
      const rect = canvas.getBoundingClientRect();
      let nonblank = false;
      try {
        const ctx = canvas.getContext("2d");
        if (ctx && canvas.width && canvas.height) {
          const w = Math.min(64, canvas.width);
          const h = Math.min(64, canvas.height);
          const data = ctx.getImageData(0, 0, w, h).data;
          for (let i = 3; i < data.length; i += 16) {
            if (data[i] > 0 || data[i - 1] > 8 || data[i - 2] > 8 || data[i - 3] > 8) {
              nonblank = true;
              break;
            }
          }
        }
      } catch {}
      return { width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, nonblank };
    });
    const bodyText = document.body.innerText || "";
    const hasMuteControl = /\\b(mute|unmute|sound|audio|volume)\\b/i.test(bodyText) || [...document.querySelectorAll("[aria-label], [title]")].some((el) => /\\b(mute|unmute|sound|audio|volume)\\b/i.test((el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "")));
    const reduceMotionMentions = [...document.styleSheets].some((sheet) => {
      try { return [...sheet.cssRules].some((rule) => String(rule.cssText).includes("prefers-reduced-motion")); } catch { return false; }
    });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      horizontalOverflow,
      maxRightOverflow,
      textOverflowCount: textOverflow.length,
      textOverflowSamples: textOverflow.slice(0, 5).map((el) => (el.innerText || el.textContent || "").trim().slice(0, 80)),
      smallTapTargets,
      canvasNonblank: canvases.length === 0 || canvases.some((canvas) => canvas.nonblank),
      canvases,
      hasMuteControl,
      reduceMotionMentions
    };
  })()`;
}

function scoreSource() {
  return `(() => {
    const candidates = [...document.querySelectorAll("#score, [data-score], .score, strong, output")];
    for (const el of candidates) {
      const value = Number((el.textContent || "").replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(value)) return value;
    }
    const match = (document.body.innerText || "").match(/score\\s*([0-9]+)/i);
    return match ? Number(match[1]) : 0;
  })()`;
}

function rewardTriggerSource() {
  return `(() => {
    const clickByText = (pattern) => {
      const button = [...document.querySelectorAll("button, [role=button], a")].find((el) => pattern.test((el.innerText || el.textContent || el.getAttribute("aria-label") || "").trim()));
      if (button) {
        button.click();
        return true;
      }
      return false;
    };
    clickByText(/start|play|begin|launch|restart/i);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true }));
    if (window.__vnemSnake?.placeAppleAhead) {
      window.__vnemSnake.placeAppleAhead();
    }
    setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true }));
    }, 80);
    return true;
  })()`;
}

function rewardMetricsSource() {
  return `(() => {
    const flash = document.querySelector(".flash, [data-flash], #flash");
    let flashActivated = false;
    let flashAnchored = false;
    if (flash) {
      const style = getComputedStyle(flash);
      const inline = flash.getAttribute("style") || "";
      const cssOrigin = style.getPropertyValue("--fx") || style.getPropertyValue("--flash-x") || style.getPropertyValue("--flash-y");
      const bg = style.backgroundImage || "";
      flashActivated = /active|pulse|flash|hit|reward/i.test(flash.className || "") || inline.length > 0 || cssOrigin.trim().length > 0;
      flashAnchored = cssOrigin.trim().length > 0 || /var\\(--fx|var\\(--flash|at\\s+(?!50%\\s+50%)/i.test(bg) || /left|top|transform/i.test(inline);
    }
    return {
      flashActivated,
      flashAnchored,
      screenHash: ""
    };
  })()`;
}

async function screenshot(page, filePath) {
  const result = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const buffer = Buffer.from(result.data, "base64");
  await writeFile(filePath, buffer);
  return buffer.length;
}

async function navigate(page, url) {
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  const loaded = page.waitForEvent("Page.loadEventFired", 8000).catch(() => null);
  await page.send("Page.navigate", { url });
  await loaded;
}

async function evaluate(page, expression) {
  const result = await page.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    return null;
  }
  return result.result?.value ?? null;
}

async function wait(page, ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function canvasFits(metrics) {
  const canvases = metrics.canvases || [];
  if (!canvases.length) return true;
  return canvases.every((canvas) => canvas.width <= metrics.viewport.width + 1 && canvas.height <= metrics.viewport.height * 0.78 && canvas.right <= metrics.viewport.width + 12);
}

function hasMotion(text) {
  return /(animation|transition|requestAnimationFrame|particle|flash|pulse|glow|transform)/i.test(text);
}

function anchoredReward(text) {
  const reward = /\b(apple|collect|reward|score|particle|burst|flash|pulse|spark|pickup)\b/i.test(text);
  const coordinates = /\b(x|y|dx|dy|left|top|clientX|clientY|pageX|pageY|position|origin|spawn|gridX|gridY)\b/i.test(text);
  const eventLocal = /\b(food|apple|collectible|segment|head|cell|tile|collision|hit|pickup)\b/i.test(text);
  return reward && coordinates && eventLocal && anchoredScreenEffect(text);
}

function anchoredScreenEffect(text) {
  const lower = text.toLowerCase();
  const hasFlashLayer = /\.flash\b|screenflash|flash(el|element)?\b/.test(lower);
  if (!hasFlashLayer) return true;
  const flashUsesCssOrigin = /--fx|--flash-x|--flash-y|flash\w*\.style\.(?:left|top|transform|setProperty)|flash\w*\.style\.setProperty\(["']--/i.test(text);
  const flashGradientHasVarOrigin = /\.flash[\s\S]{0,700}radial-gradient\([^;\n]*(?:var\(|--fx|--flash)/i.test(text);
  return flashUsesCssOrigin || flashGradientHasVarOrigin;
}

async function openPage(port) {
  const target = await fetchJson(`http://127.0.0.1:${port}/json/new`, { method: "PUT" });
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  return {
    send: (method, params) => client.send(method, params),
    waitForEvent: (method, timeoutMs) => client.waitForEvent(method, timeoutMs),
    close: async () => {
      await client.close();
      await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {});
    }
  };
}

class CdpClient {
  static async connect(wsUrl) {
    const socket = new WebSocket(wsUrl);
    const client = new CdpClient(socket);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out connecting to browser target")), 8000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return client;
  }

  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    this.eventWaiters = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message || "CDP command failed"));
        else resolve(message.result || {});
        return;
      }
      if (message.method && this.eventWaiters.has(message.method)) {
        for (const waiter of this.eventWaiters.get(message.method)) {
          waiter.resolve(message.params || {});
        }
        this.eventWaiters.delete(message.method);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, 10000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      this.socket.send(payload);
    });
  }

  waitForEvent(method, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = this.eventWaiters.get(method) || [];
        this.eventWaiters.set(method, waiters.filter((waiter) => waiter.resolve !== wrappedResolve));
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const wrappedResolve = (value) => {
        clearTimeout(timer);
        resolve(value);
      };
      const waiters = this.eventWaiters.get(method) || [];
      waiters.push({ resolve: wrappedResolve });
      this.eventWaiters.set(method, waiters);
    });
  }

  async close() {
    this.socket.close();
  }
}

async function launchBrowser(executablePath) {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "vnem-browser-"));
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "about:blank"
  ];
  const child = spawn(executablePath, args, {
    stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const portFile = path.join(userDataDir, "DevToolsActivePort");
  const port = await waitForPortFile(portFile, stderr);
  return {
    port,
    close: () => {
      child.kill("SIGTERM");
      rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    }
  };
}

async function waitForPortFile(filePath, stderrRef) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    if (existsSync(filePath)) {
      const text = await readFile(filePath, "utf8");
      const port = Number(text.split(/\s+/)[0]);
      if (Number.isFinite(port)) return port;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Chrome did not expose a DevTools port. ${stderrRef || ""}`);
}

async function serveStatic(root) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      let filePath = path.resolve(root, decodeURIComponent(url.pathname.slice(1)));
      if (!filePath.startsWith(root)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      const info = await stat(filePath).catch(() => null);
      if (info?.isDirectory()) filePath = path.join(filePath, "index.html");
      const fileInfo = await stat(filePath).catch(() => null);
      if (!fileInfo?.isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.writeHead(200, { "Content-Type": mimeType(filePath) });
      createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(500);
      response.end(String(error?.message || error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${url}`);
  }
  return response.json();
}

function chooseHtml(files, dir) {
  const index = path.join(dir, "index.html");
  if (files.includes(index)) return index;
  return files.find((file) => /\.html$/i.test(file));
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "build") {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    if (!entry.isFile()) continue;
    const info = await stat(fullPath).catch(() => null);
    if (info && info.size <= 2_000_000) files.push(fullPath);
  }
  return files;
}

function findBrowser() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium"
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg"
  }[ext] || "application/octet-stream";
}

function safeSlug(value) {
  return String(value || "artifact").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artifact";
}

function check(id, ok, reason) {
  return { id, ok: Boolean(ok), reason };
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

await main();
