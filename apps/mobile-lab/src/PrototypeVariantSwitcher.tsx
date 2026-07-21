import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type PrototypeVariantOption<Key extends string> = {
  key: Key;
  label: string;
};

/**
 * Interaction Lab-only control. It is intentionally outside the production app
 * and therefore cannot ship in a mobile bundle.
 */
export function PrototypeVariantSwitcher<Key extends string>({
  current,
  options,
  onChange
}: {
  current: Key;
  options: readonly PrototypeVariantOption<Key>[];
  onChange: (next: Key) => void;
}): React.JSX.Element {
  const currentIndex = Math.max(
    0,
    options.findIndex((option) => option.key === current)
  );
  const currentOption = options[currentIndex] ?? options[0];

  const cycle = (direction: -1 | 1) => {
    if (options.length === 0) {
      return;
    }
    const nextIndex = (currentIndex + direction + options.length) % options.length;
    const next = options[nextIndex];
    if (next) {
      onChange(next.key);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName.toLowerCase();
        if (
          tagName === "input"
          || tagName === "textarea"
          || target.isContentEditable
        ) {
          return;
        }
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        cycle(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        cycle(1);
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <View style={styles.positioner}>
      <View
        accessibilityLabel="Prototype variant switcher"
        style={styles.bar}
        testID="prototype-variant-switcher"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous prototype variant"
          style={styles.arrowButton}
          testID="prototype-variant-previous"
          onPress={() => cycle(-1)}
        >
          <Text style={styles.arrowText}>←</Text>
        </Pressable>
        <View style={styles.labelBlock}>
          <Text style={styles.kicker}>DESIGN VARIANT</Text>
          <Text style={styles.label} numberOfLines={1}>
            {current.toUpperCase()} — {currentOption?.label ?? current}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next prototype variant"
          style={styles.arrowButton}
          testID="prototype-variant-next"
          onPress={() => cycle(1)}
        >
          <Text style={styles.arrowText}>→</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    alignItems: "center",
    bottom: 70,
    left: 10,
    position: "absolute",
    pointerEvents: "box-none",
    right: 10,
    zIndex: 99990
  },
  bar: {
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderColor: "#475569",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    maxWidth: 360,
    padding: 4,
    boxShadow: "0 5px 12px rgba(15, 23, 42, 0.26)",
    width: "100%"
  },
  arrowButton: {
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 999,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  arrowText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900"
  },
  labelBlock: {
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8
  },
  kicker: {
    color: "#93C5FD",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1
  },
  label: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    marginTop: 1
  }
});
