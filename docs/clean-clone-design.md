# Clean Clone Studio - Architecture & Design Document

## Vision
A CLI tool that takes a single URL, renders it in a headless browser, extracts the rendered DOM + computed styles + screenshots, then runs that data through deterministic rules (with platform-specific adapters for Framer and Webflow) to emit a clean HTML/Tailwind/JS output. The output visually matches the source pixel-for-pixel — including animations (via Motion One) — but is constructed using semantic, flowing HTML and Tailwind utility classes rather than rigid absolute positioning.

## Core Decisions & Rationale

| Decision # | Summary | Rationale |
|---|---|---|
| **D1** | **Single URL → single page output** | Tightest scope, ships fastest, multi-page is N × tool. |
| **D2** | **Pixel-exact fidelity is the hard constraint** | User-stated requirement; downstream architecture follows. |
| **D3** | **Hybrid acquisition: rendered DOM + computed styles + screenshot verification** | Only path with both structural data and pixel-truth. We will leverage concepts from `designlang` for the acquisition layer. |
| **D4** | **Deterministic rule-based conversion engine** | Reproducible, debuggable, no API costs, rule corpus grows over time. No auto-iterative LLM loops to preserve determinism. |
| **D5** | **Full interactivity parity** | User-stated requirement. We must capture hover/focus states and animations. |
| **D6** | **Ship Motion One as runtime animation library** | Closest mental model to Framer Motion, very small (~17kb gzipped), utilizes native Web Animations API. |
| **D7** | **Generic engine + Framer/Webflow platform adapters** | Extensible to Wix/Squarespace/etc.; clear separation of concerns. Adapters handle removing platform-specific bloat. |
| **D8** | **Output: HTML + CSS + JS + Tailwind config + assets dir** | "Easy to edit" wins. Three files is what a human dev writes. CDN for Tailwind means zero build steps out of the box, with a `tailwind.config.js` acting as design token documentation. |
| **D9** | **Tailwind v3 with arbitrary values when tokens don't match** | Pixel-exactness compatibility. Emit `mt-[47px]` when no token matches, and `mt-12` when it does. |
| **D10** | **Download all assets locally** | Self-contained, link-rot proof, enables local optimization (e.g. webp conversion). Self-host Google Fonts. |
| **D11** | **Map source breakpoints to Tailwind defaults** | Matches standard developer mental model (`sm:`, `md:`, `lg:`). |
| **D12** | **Screenshot diff as hard quality gate** | Preserves determinism; failures explicitly highlight the need for new rules rather than hallucinating fixes. |
| **D13** | **CLI npm package, local-only** | Lowest infrastructure; integrates natively with existing local tooling, Claude Code, and CI pipelines. |

## Outputs Structure
The standard output for a completed clone will be:
```
output/
  index.html          ← markup + Tailwind utility classes
  styles.css          ← custom CSS Tailwind can't express
  script.js           ← Motion One init + interactions
  tailwind.config.js  ← design tokens from extraction
  assets/             ← downloaded images, fonts, SVGs
```

## Known Risks
1. **The 95% Ceiling:** The last 5-10% of pixel perfection lives in edge cases. The tool will fail on unknown patterns until the rule corpus is updated.
2. **Unsupported Advanced Graphics:** WebGL, Three.js, Canvas, and complex SVG morphs are not standard DOM animations. The tool should fail gracefully on these rather than outputting garbage.
3. **Pseudo-classes:** `getComputedStyle()` only sees the active state. We must parse stylesheets to extract `:hover`, `:focus`, and `@keyframes`.
4. **Platform Drift:** Framer/Webflow update their DOM structures. The rule corpus must be versioned and tested continuously.
5. **Runtime Dependency:** The output is "pure" except for Motion One. This is a deliberate tradeoff for animation parity.

## Proposed Build Sequence
1. **Acquisition Adapter:** Wrap/mimic `designlang`. Extract DOM, computed styles, screenshots, and breakpoint variants.
2. **Conversion Core:** Build the Node → Tailwind-class-string translator. Write rules for the 50 most common flex/grid/spacing patterns.
3. **Framer Adapter:** Bloat-removal rules (strip `framer-*` classes, collapse hydration wrappers, map Framer Motion data to Motion One).
4. **HTML Emitter:** Render the cleaned node tree to indented HTML with semantic tags (`<section>`, `<nav>`, `<footer>`).
5. **Verification Pipeline:** Playwright headless render → screenshot diff against original. Exit non-zero on breach.
6. **Webflow Adapter:** Second platform to validate the abstraction.
7. **Motion Translation:** Translate captured motion data to Motion One initialization.
