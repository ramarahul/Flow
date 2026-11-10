import { useEffect, useRef } from "react";

// A pointer-transparent light field reacts across the canvas and control surfaces.
export function LiquidBackground({ enabled }: { enabled: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!enabled) return;
    const element = canvas.current;
    const popup = element?.parentElement;
    const context = element?.getContext("2d", { alpha: true });
    if (!element || !popup || !context) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = matchMedia("(pointer: coarse)");
    let width = 0,
      height = 0;
    let current = new Float32Array(0),
      previous = new Float32Array(0);
    let frame = 0,
      steps = 0;
    let last: { x: number; y: number } | null = null;
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      steps = 0;
      last = null;
      current.fill(0);
      previous.fill(0);
      context.clearRect(0, 0, width, height);
    };
    const resize = () => {
      stop();
      width = Math.max(3, Math.ceil(popup.clientWidth / 4));
      height = Math.max(3, Math.ceil(popup.clientHeight / 4));
      element.width = width;
      element.height = height;
      current = new Float32Array(width * height);
      previous = new Float32Array(width * height);
    };
    const draw = () => {
      frame = 0;
      const image = context.createImageData(width, height);
      let energy = 0;
      const color = getComputedStyle(popup).getPropertyValue("--accent").trim();
      const rgb = [1, 3, 5].map((offset) =>
        parseInt(color.slice(offset, offset + 2), 16),
      );
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = y * width + x;
          const laplacian =
            current[i - 1] +
            current[i + 1] +
            current[i - width] +
            current[i + width] -
            4 * current[i];
          previous[i] = (2 * current[i] - previous[i] + 0.22 * laplacian) * 0.985;
          energy = Math.max(energy, Math.abs(previous[i]));
          // Slopes refract a broad highlight and shadow, rather than drawing particles.
          const slope =
            (current[i - 1] - current[i + 1]) * 0.8 +
            (current[i - width] - current[i + width]) * 0.6;
          const highlight = slope > 0;
          const pixel = i * 4;
          image.data[pixel] = highlight ? 255 : rgb[0];
          image.data[pixel + 1] = highlight ? 255 : rgb[1];
          image.data[pixel + 2] = highlight ? 255 : rgb[2];
          image.data[pixel + 3] = Math.min(65, Math.abs(slope) * 65);
        }
      }
      [current, previous] = [previous, current];
      context.putImageData(image, 0, 0);
      steps++;
      if (energy > 0.015 && steps < 180) frame = requestAnimationFrame(draw);
      else stop();
    };
    const move = (event: PointerEvent) => {
      if (motion.matches || coarse.matches || event.pointerType !== "mouse") return;
      const bounds = element.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) * width) / bounds.width;
      const y = ((event.clientY - bounds.top) * height) / bounds.height;
      const speed = last ? Math.min(1, Math.hypot(x - last.x, y - last.y) / 5) : 0.35;
      if (speed < 0.05) return;
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          const px = Math.round(x) + dx,
            py = Math.round(y) + dy;
          if (px < 1 || px >= width - 1 || py < 1 || py >= height - 1) continue;
          const pressure = Math.exp(-(dx * dx + dy * dy) / 22) * speed * 0.8;
          current[py * width + px] = Math.max(-4, current[py * width + px] - pressure);
        }
      }
      last = { x, y };
      steps = 0;
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const leave = () => {
      last = null;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(popup);
    popup.addEventListener("pointermove", move);
    popup.addEventListener("pointerleave", leave);
    motion.addEventListener("change", stop);
    coarse.addEventListener("change", stop);
    resize();
    return () => {
      stop();
      observer.disconnect();
      popup.removeEventListener("pointermove", move);
      popup.removeEventListener("pointerleave", leave);
      motion.removeEventListener("change", stop);
      coarse.removeEventListener("change", stop);
    };
  }, [enabled]);
  if (!enabled) return null;
  return <canvas className="liquid-background" ref={canvas} aria-hidden="true" />;
}
