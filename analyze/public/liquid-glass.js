// Vanilla JS Liquid Glass Effect - Paste into browser console
// Created by Shu Ding (https://github.com/shuding/liquid-glass) in 2025.

(function () {
  "use strict";

  // Check if liquid glass already exists and destroy it
  if (window.liquidGlass) {
    window.liquidGlass.destroy();
    console.log("Previous liquid glass effect removed.");
  }

  // Utility functions
  function smoothStep(a, b, t) {
    t = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function length(x, y) {
    return Math.sqrt(x * x + y * y);
  }

  function roundedRectSDF(x, y, width, height, radius) {
    const qx = Math.abs(x) - width + radius;
    const qy = Math.abs(y) - height + radius;
    return (
      Math.min(Math.max(qx, qy), 0) +
      length(Math.max(qx, 0), Math.max(qy, 0)) -
      radius
    );
  }

  function texture(x, y) {
    return { type: "t", x, y };
  }

  // Generate unique ID
  function generateId() {
    return "liquid-glass-" + Math.random().toString(36).substr(2, 9);
  }

  // Main Shader class
  class Shader {
    constructor(options = {}) {
      this.width = options.width || 100;
      this.height = options.height || 100;
      this.fragment = options.fragment || ((uv) => texture(uv.x, uv.y));
      this.canvasDPI = 1;
      this.id = generateId();
      this.offset = 10; // Viewport boundary offset

      this.mouse = { x: 0, y: 0 };
      this.mouseUsed = false;

      this.createElement();
      this.setupEventListeners();
      this.updateShader();
    }

    createElement() {
      // Create container
      this.container = document.createElement("div");
      this.container.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: ${this.width}px;
        height: ${this.height}px;
        overflow: hidden;
        border-radius: 50%;
        box-shadow:
          0 8px 24px rgba(0, 0, 0, 0.35),
          0 0 1px 1px inset rgba(255, 255, 255, 0.5);
        cursor: grab;
        backdrop-filter: url(#${this.id}_filter) blur(0.4px) brightness(1.35) saturate(1.05);
        z-index: 9999;
        pointer-events: none;
      `;

      // Create SVG filter
      this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      this.svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      this.svg.setAttribute("width", "0");
      this.svg.setAttribute("height", "0");
      this.svg.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        pointer-events: none;
        z-index: 9998;
      `;

      const defs = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "defs"
      );
      const filter = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "filter"
      );
      filter.setAttribute("id", `${this.id}_filter`);
      filter.setAttribute("filterUnits", "userSpaceOnUse");
      filter.setAttribute("colorInterpolationFilters", "sRGB");
      filter.setAttribute("x", "0");
      filter.setAttribute("y", "0");
      filter.setAttribute("width", this.width.toString());
      filter.setAttribute("height", this.height.toString());

      this.feImage = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "feImage"
      );
      this.feImage.setAttribute("id", `${this.id}_map`);
      this.feImage.setAttribute("width", this.width.toString());
      this.feImage.setAttribute("height", this.height.toString());

      this.feDisplacementMap = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "feDisplacementMap"
      );
      this.feDisplacementMap.setAttribute("in", "SourceGraphic");
      this.feDisplacementMap.setAttribute("in2", `${this.id}_map`);
      this.feDisplacementMap.setAttribute("xChannelSelector", "R");
      this.feDisplacementMap.setAttribute("yChannelSelector", "G");

      filter.appendChild(this.feImage);
      filter.appendChild(this.feDisplacementMap);
      defs.appendChild(filter);
      this.svg.appendChild(defs);

      // Create canvas for displacement map (hidden)
      this.canvas = document.createElement("canvas");
      this.canvas.width = this.width * this.canvasDPI;
      this.canvas.height = this.height * this.canvasDPI;
      this.canvas.style.display = "none";

      this.context = this.canvas.getContext("2d");
    }

    constrainPosition(x, y) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Calculate boundaries with offset
      const minX = this.offset;
      const maxX = viewportWidth - this.width - this.offset;
      const minY = this.offset;
      const maxY = viewportHeight - this.height - this.offset;

      // Constrain position
      const constrainedX = Math.max(minX, Math.min(maxX, x));
      const constrainedY = Math.max(minY, Math.min(maxY, y));

      return { x: constrainedX, y: constrainedY };
    }

    setupEventListeners() {
      let isDragging = false;
      let startX, startY, initialX, initialY;

      const updateLens = () => {
        const rect = this.container.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const r = Math.min(rect.width, rect.height) / 2;
        window.currentLens = { x: cx, y: cy, r };
      };

      this.container.addEventListener("mousedown", (e) => {
        isDragging = true;
        this.container.style.cursor = "grabbing";
        startX = e.clientX;
        startY = e.clientY;
        const rect = this.container.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        e.preventDefault();
        updateLens();
      });

      document.addEventListener("mousemove", (e) => {
        // Follow cursor: center lens at mouse position
        const desiredX = e.clientX - this.width / 2;
        const desiredY = e.clientY - this.height / 2;
        const constrained = this.constrainPosition(desiredX, desiredY);
        this.container.style.left = constrained.x + "px";
        this.container.style.top = constrained.y + "px";
        this.container.style.transform = "none";
        updateLens();

        // Update mouse position for shader (relative to lens)
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = (e.clientX - rect.left) / rect.width;
        this.mouse.y = (e.clientY - rect.top) / rect.height;
        if (this.mouseUsed) this.updateShader();
      });

      document.addEventListener("mouseup", () => {
        isDragging = false;
        this.container.style.cursor = "grab";
      });

      // Handle window resize to maintain constraints
      window.addEventListener("resize", () => {
        const rect = this.container.getBoundingClientRect();
        const constrained = this.constrainPosition(rect.left, rect.top);

        if (rect.left !== constrained.x || rect.top !== constrained.y) {
          this.container.style.left = constrained.x + "px";
          this.container.style.top = constrained.y + "px";
          this.container.style.transform = "none";
          updateLens();
        }
      });

      // initialize lens state after first frame
      requestAnimationFrame(updateLens);
    }

    updateShader() {
      const mouseProxy = new Proxy(this.mouse, {
        get: (target, prop) => {
          this.mouseUsed = true;
          return target[prop];
        },
      });

      this.mouseUsed = false;

      const w = this.width * this.canvasDPI;
      const h = this.height * this.canvasDPI;
      const data = new Uint8ClampedArray(w * h * 4);

      let maxScale = 0;
      const rawValues = [];

      for (let i = 0; i < data.length; i += 4) {
        const x = (i / 4) % w;
        const y = Math.floor(i / 4 / w);
        const pos = this.fragment({ x: x / w, y: y / h }, mouseProxy);
        const dx = pos.x * w - x;
        const dy = pos.y * h - y;
        maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
        rawValues.push(dx, dy);
      }

      maxScale *= 0.5;

      let index = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = rawValues[index++] / maxScale + 0.5;
        const g = rawValues[index++] / maxScale + 0.5;
        data[i] = r * 255;
        data[i + 1] = g * 255;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }

      this.context.putImageData(new ImageData(data, w, h), 0, 0);
      this.feImage.setAttributeNS(
        "http://www.w3.org/1999/xlink",
        "href",
        this.canvas.toDataURL()
      );
      // Increase displacement intensity a bit for a more pronounced pressed look
      this.feDisplacementMap.setAttribute(
        "scale",
        ((maxScale / this.canvasDPI) * 1.3).toString()
      );
    }

    appendTo(parent) {
      parent.appendChild(this.svg);
      parent.appendChild(this.container);
    }

    destroy() {
      this.svg.remove();
      this.container.remove();
      this.canvas.remove();
    }
  }

  // Create the liquid glass effect
  function createLiquidGlass() {
    // Create shader (circular lens)
    const shader = new Shader({
      width: 340,
      height: 340,
      fragment: (uv) => {
        const dx = uv.x - 0.5;
        const dy = uv.y - 0.5;
        const d = Math.sqrt(dx * dx + dy * dy);
        // Stronger pressed effect: start earlier and intensify near edge
        const displacement = smoothStep(0.62, 0.32, d);
        // Base zoom ~1.2x at center
        const base = 1.0 / 1.2;
        const scale = base + (1.0 - base) * displacement;
        // Add radial bulge toward the edge for a pressed look
        const edgeBulge =
          1.0 + (1.0 - Math.min(d * 2.0, 1.0)) * 0.12 * displacement;
        const sx = dx * scale * edgeBulge;
        const sy = dy * scale * edgeBulge;
        return texture(sx + 0.5, sy + 0.5);
      },
    });

    // Add to page
    shader.appendTo(document.body);

    console.log("Liquid Glass effect created! Drag the glass around the page.");

    // Return shader instance so it can be removed if needed
    window.liquidGlass = shader;
  }

  // Initialize
  createLiquidGlass();
})();
