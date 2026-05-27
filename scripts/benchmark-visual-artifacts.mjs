#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const documentsDir = path.resolve(rootDir, "..");
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

if (!dirs.length) {
  console.log("vnem visual artifact benchmark");
  console.log("No artifact folders found. Pass folders as arguments or set VNEM_VISUAL_ARTIFACTS.");
  console.log("Example: npm run benchmark:visual -- ../vnemtest1 ../novnemtest1");
  process.exit(0);
}

const results = [];
for (const dir of dirs) {
  results.push(await scoreDirectory(dir));
}

console.log("vnem visual artifact benchmark");
for (const result of results) {
  console.log(`- ${path.basename(result.dir)}: ${result.score}%`);
  for (const check of result.checks) {
    const status = check.ok ? "pass" : "miss";
    console.log(`  ${status} ${check.id}: ${check.reason}`);
  }
  if (result.risks.length) {
    console.log(`  risks: ${result.risks.join("; ")}`);
  }
}

const ranked = [...results].sort((a, b) => b.score - a.score || a.dir.localeCompare(b.dir));
if (ranked.length > 1) {
  console.log(`Top artifact: ${path.basename(ranked[0].dir)} (${ranked[0].score}%)`);
}

async function scoreDirectory(dir) {
  const files = await walk(dir);
  const codeFiles = files.filter((file) => /\.(html|css|js|mjs|jsx|ts|tsx)$/i.test(file));
  const assetFiles = files.filter((file) => /\.(png|jpe?g|webp|gif|svg|avif|mp3|wav|ogg|m4a)$/i.test(file));
  const snippets = await Promise.all(codeFiles.map((file) => readFile(file, "utf8").catch(() => "")));
  const text = snippets.join("\n").slice(0, 1_500_000);
  const lower = text.toLowerCase();
  const isGameLike = /\b(canvas|snake|game|score|apple|collect|collision|requestanimationframe)\b/i.test(text);
  const hasAudio = /\.(mp3|wav|ogg|m4a)$/i.test(assetFiles.join("\n")) || /\b(AudioContext|HTMLAudioElement|new Audio|oscillator|gainNode|audio)\b/i.test(text);

  const checks = [
    check("entrypoint", codeFiles.some((file) => /\.(html|jsx|tsx|js|mjs)$/i.test(file)), "has a runnable page or app entrypoint"),
    check("local_assets", assetFiles.length > 0 || /\b(assets|public|img|image|background-image)\b/i.test(text), "uses local or repo-discoverable visual/audio assets"),
    check("design_tokens", /:root|--(?:color|space|radius|shadow|font|surface|accent)|theme|tokens/i.test(text), "defines or reuses design tokens/CSS variables/theme structure"),
    check("responsive_fit", /@media|container-type|@container|clamp\(|minmax\(|max-width|aspect-ratio|dvh|svh|rem\b/i.test(text), "contains responsive constraints for desktop/mobile fit"),
    check("canvas_bounds", !isGameLike || /max-width|max-height|aspect-ratio|clientWidth|clientHeight|getBoundingClientRect|resize|clamp\(|min\(/i.test(text), "game/canvas sizing is bounded by viewport or container"),
    check("visual_polish", /box-shadow|text-shadow|drop-shadow|filter:|backdrop-filter|linear-gradient|radial-gradient|transition|animation|transform|particle|glow|blur/i.test(text), "has deliberate polish signals such as shadows, gradients, transitions, particles, or glow"),
    check("reduced_motion", !/(animation|transition|requestanimationframe|particle|flash|pulse|glow)/i.test(text) || /prefers-reduced-motion|reduceMotion|reducedMotion/i.test(text), "motion-heavy work includes reduced-motion handling"),
    check("audio_control", !hasAudio || /\b(mute|muted|volume|gain|suspend|resume|unlock|audioToggle|soundToggle)\b/i.test(text), "audio is controllable or unlock/mute aware"),
    check("anchored_reward", !isGameLike || anchoredReward(text), "reward feedback and screen flashes appear anchored to event/object coordinates"),
    check("accessibility_surface", /\b(aria-|role=|tabindex|button|label|title=|alt=|focus-visible|:focus)\b/i.test(text), "surface includes basic accessible controls, labels, or focus affordances")
  ];

  const risks = [];
  if (isGameLike && /\bflash|screenflash|pulse|glow\b/i.test(text) && !anchoredReward(text)) {
    risks.push("reward or flash effects may be global/centered instead of event-anchored");
  }
  if (hasAudio && !/\b(mute|muted|volume|gain|soundToggle|audioToggle)\b/i.test(text)) {
    risks.push("audio appears present without an obvious mute/volume control");
  }
  if (/\b(canvas\b|game-board|playfield)/i.test(text) && !/max-width|max-height|aspect-ratio|clamp\(/i.test(text)) {
    risks.push("playfield may start oversized without stable responsive bounds");
  }

  const score = Math.round((checks.filter((item) => item.ok).length / checks.length) * 100);
  return {
    dir,
    score,
    files: files.map((file) => path.relative(dir, file)),
    checks,
    risks
  };
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
  if (!hasFlashLayer) {
    return true;
  }
  const flashUsesCssOrigin = /--fx|--flash-x|--flash-y|flash\w*\.style\.(?:left|top|transform|setProperty)|flash\w*\.style\.setProperty\(["']--/i.test(text);
  const flashGradientHasVarOrigin = /\.flash[\s\S]{0,700}radial-gradient\([^;\n]*(?:var\(|--fx|--flash)/i.test(text);
  return flashUsesCssOrigin || flashGradientHasVarOrigin;
}

function check(id, ok, reason) {
  return { id, ok: Boolean(ok), reason };
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
    if (!entry.isFile()) {
      continue;
    }
    const info = await stat(fullPath).catch(() => null);
    if (info && info.size <= 2_000_000) {
      files.push(fullPath);
    }
  }
  return files;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}
