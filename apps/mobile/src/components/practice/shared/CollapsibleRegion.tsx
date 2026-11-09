import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  type StyleProp,
  View,
  type ViewStyle
} from "react-native";
import { makeStyles, useTheme } from "../../../theme/index.ts";
import { Icon } from "../../ui/index.tsx";

const DISCLOSURE_MOTION_DURATION_MS = 200;

export function CollapsibleRegion({
  children,
  contentTestID,
  contentStyle,
  expanded
}: {
  children: React.ReactNode;
  contentTestID: string;
  contentStyle?: StyleProp<ViewStyle>;
  expanded: boolean;
}): React.JSX.Element | null {
  return (
    <AnimatedCollapsibleRegion
      contentTestID={contentTestID}
      contentStyle={contentStyle}
      expanded={expanded}
    >
      {children}
    </AnimatedCollapsibleRegion>
  );
}

function AnimatedCollapsibleRegion({
  children,
  contentTestID,
  contentStyle,
  expanded
}: {
  children: React.ReactNode;
  contentTestID: string;
  contentStyle?: StyleProp<ViewStyle>;
  expanded: boolean;
}): React.JSX.Element | null {
  const styles = useStyles();
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const [contentHeight, setContentHeight] = useState(0);
  const durationMs = DISCLOSURE_MOTION_DURATION_MS;

  useEffect(() => {
    progress.stopAnimation();
    Animated.timing(progress, {
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
      toValue: expanded ? 1 : 0,
      useNativeDriver: false
    }).start();
  }, [durationMs, expanded, progress]);

  useEffect(() => {
    if (!expanded || contentHeight <= 0) {
      return;
    }
    progress.stopAnimation();
    Animated.timing(progress, {
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: false
    }).start();
  }, [contentHeight, durationMs, expanded, progress]);

  const animatedHeight = contentHeight > 0
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, contentHeight] })
    : expanded
      ? undefined
      : 0;
  const shouldMeasureInFlow = expanded && contentHeight === 0;
  const opacity = progress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.55, 1]
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-4, 0]
  });

  return (
    <Animated.View
      aria-hidden={!expanded}
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
      pointerEvents={expanded ? "auto" : "none"}
      style={[
        styles.collapsibleMotionClip,
        { height: animatedHeight, opacity, transform: [{ translateY }] }
      ]}
      testID={`${contentTestID}-motion`}
    >
      <View
        style={[
          contentStyle,
          shouldMeasureInFlow ? null : styles.collapsibleMotionContent
        ]}
        testID={contentTestID}
        onLayout={(event: LayoutChangeEvent) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height);
          if (nextHeight > 0 && nextHeight !== contentHeight) {
            setContentHeight(nextHeight);
          }
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

export function DisclosureChevron({
  expanded,
  testID
}: {
  expanded: boolean;
  testID?: string;
}): React.JSX.Element {
  return (
    <AnimatedDisclosureChevron
      expanded={expanded}
      testID={testID}
    />
  );
}

function AnimatedDisclosureChevron({
  expanded,
  testID
}: {
  expanded: boolean;
  testID?: string;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  useEffect(() => {
    progress.stopAnimation();
    Animated.timing(progress, {
      duration: DISCLOSURE_MOTION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      toValue: expanded ? 1 : 0,
      useNativeDriver: false
    }).start();
  }, [expanded, progress]);

  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"]
  });
  return (
    <Animated.View
      style={[styles.disclosureChevronMotion, { transform: [{ rotate }] }]}
      testID={testID}
    >
      <Icon color={appTheme.colors.text.tertiary} name="chevronDown" size={15} testID="chevron-down-glyph" weight="semibold" />
    </Animated.View>
  );
}

const useStyles = makeStyles(() => ({
  disclosureChevronMotion: {
    alignItems: "center",
    height: 18,
    justifyContent: "center",
    width: 18
  },
  collapsibleMotionClip: {
    overflow: "hidden",
    width: "100%"
  },
  collapsibleMotionContent: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
}));
