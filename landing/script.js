const commandText = document.getElementById("commandText");
const copyButtons = [
  document.getElementById("copyCommandHeader"),
  document.getElementById("copyCommand"),
  document.getElementById("copyCommandFooter")
].filter(Boolean);

async function copyCommand(button) {
  const command = commandText?.textContent?.trim() || "";
  const label = button.querySelector("span") || button;
  const original = label.textContent;

  try {
    await navigator.clipboard.writeText(command);
    label.textContent = "Copied";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(commandText);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    label.textContent = "Selected";
  }

  window.setTimeout(() => {
    label.textContent = original;
  }, 1600);
}

copyButtons.forEach((button) => {
  button.addEventListener("click", () => copyCommand(button));
});

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const vantaTrunk = document.getElementById("vantaTrunk");
const customCursor = document.getElementById("customCursor");
const cursorMark = customCursor?.querySelector(".cursor-mark");
const finePointer = window.matchMedia("(pointer: fine)");

if (customCursor && cursorMark && finePointer.matches) {
  document.body.classList.add("custom-cursor-ready");

  window.addEventListener("pointermove", (event) => {
    customCursor.style.transform = `translate3d(${event.clientX - 6}px, ${event.clientY - 6}px, 0)`;
    customCursor.style.opacity = "0.96";
    customCursor.classList.add("is-visible");
  });

  window.addEventListener("pointerdown", () => customCursor.classList.add("is-pressed"));
  window.addEventListener("pointerup", () => customCursor.classList.remove("is-pressed"));
  document.addEventListener("mouseleave", () => {
    customCursor.style.opacity = "0";
    customCursor.classList.remove("is-visible");
  });
  document.addEventListener("mouseenter", () => customCursor.classList.add("is-visible"));
}

function startVantaTrunk() {
  if (!vantaTrunk || prefersReducedMotion || !window.VANTA?.TRUNK || !window.THREE || !window.p5) return;

  const effect = window.VANTA.TRUNK({
    el: vantaTrunk,
    mouseControls: true,
    touchControls: true,
    gyroControls: false,
    minHeight: 200.0,
    minWidth: 200.0,
    scale: 1.0,
    scaleMobile: 1.0,
    color: 0xe8b175,
    backgroundColor: 0x0b0b0d,
    spacing: 8.5,
    chaos: 2.1
  });

  if (effect) {
    document.body.classList.add("vanta-ready");
  }
}

if (document.readyState === "complete") {
  startVantaTrunk();
} else {
  window.addEventListener("load", startVantaTrunk, { once: true });
}

const canvas = document.getElementById("particles");
const ctx = canvas.getContext("2d");
const palette = ["#ff997f", "#f6b1aa", "#b8b3ff", "#f4eee8"];
let width = 0;
let height = 0;
let particles = [];

function resizeParticles() {
  const ratio = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const count = Math.min(46, Math.max(18, Math.floor(width / 34)));
  particles = Array.from({ length: count }, (_, index) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 1.35 + 0.28,
    vx: (Math.random() - 0.5) * 0.06,
    vy: (Math.random() - 0.5) * 0.06,
    color: palette[index % palette.length],
    phase: Math.random() * Math.PI * 2
  }));
}

function drawParticles(time = 0) {
  ctx.clearRect(0, 0, width, height);

  for (const particle of particles) {
    if (!prefersReducedMotion) {
      particle.x += particle.vx;
      particle.y += particle.vy;
      if (particle.x < -20) particle.x = width + 20;
      if (particle.x > width + 20) particle.x = -20;
      if (particle.y < -20) particle.y = height + 20;
      if (particle.y > height + 20) particle.y = -20;
    }

    const pulse = 0.45 + Math.sin(time / 1900 + particle.phase) * 0.25;
    ctx.globalAlpha = Math.max(0.1, pulse * 0.72);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  requestAnimationFrame(drawParticles);
}

resizeParticles();
drawParticles();
window.addEventListener("resize", resizeParticles);
