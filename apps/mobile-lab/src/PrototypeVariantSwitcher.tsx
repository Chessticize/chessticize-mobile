import React, { useEffect } from "react";

export type PrototypeVariant = {
  key: string;
  label: string;
};

type PrototypeVariantSwitcherProps = {
  current: string;
  onChange: (variant: string) => void;
  variants: readonly PrototypeVariant[];
};

/**
 * Interaction Lab-only switcher. This package is not part of either native app bundle,
 * so the control cannot ship with production UI.
 */
export function PrototypeVariantSwitcher({
  current,
  onChange,
  variants
}: PrototypeVariantSwitcherProps): React.JSX.Element {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.matches("input, textarea, select") || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      cycle(event.key === "ArrowLeft" ? -1 : 1);
    }

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  });

  const currentIndex = Math.max(0, variants.findIndex((variant) => variant.key === current));
  const currentVariant = variants[currentIndex] ?? variants[0];

  function cycle(direction: -1 | 1): void {
    const nextIndex = (currentIndex + direction + variants.length) % variants.length;
    const nextVariant = variants[nextIndex];
    if (nextVariant) {
      onChange(nextVariant.key);
    }
  }

  return (
    <nav
      aria-label="Prototype layout variants"
      className="prototype-variant-switcher"
      data-testid="prototype-variant-switcher"
    >
      <button aria-label="Previous design variant" onClick={() => cycle(-1)} type="button">←</button>
      <span className="prototype-variant-label">
        <small>LAB VARIANT</small>
        <strong>{currentVariant?.key} — {currentVariant?.label}</strong>
      </span>
      <button aria-label="Next design variant" onClick={() => cycle(1)} type="button">→</button>
    </nav>
  );
}
