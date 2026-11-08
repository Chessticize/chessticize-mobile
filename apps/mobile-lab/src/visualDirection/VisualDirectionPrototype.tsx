// Issue #609 design reference: the chosen visual direction, A "Grouped Native", rendered
// with lab-only primitives. Nothing here is imported by the app. Phase 2 applies these
// values to the production theme and shared primitives destination by destination.
import React, { createContext, useContext, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from "react-native";
import { buildPracticeAdaptiveLayout } from "../../../mobile/src/components/adaptivePracticeLayout.ts";
import BoardPlaceholder from "../BoardPlaceholder.tsx";
import {
  GROUPED_NATIVE,
  MIN_TARGET,
  SPACING_SCALE,
  contrastRatio,
  compositeOver,
  parseColor,
  type Appearance,
  type ColorRoles,
  type TypeRole,
  type VisualDirection
} from "./directions.ts";
import { LUCIDE_ICONS, type LucideIconName } from "./lucideIcons.ts";

const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif';
const PAGE_BACKGROUND = "#D9DAE0";
const PAGE_TEXT = "#1C1C1E";
const PAGE_SECONDARY = "#48484A";
const PHONE_WIDTH = 393;
const PHONE_HEIGHT = 852;
const IPAD_WIDTH = 1180;
const IPAD_HEIGHT = 820;
// Width of the reference sidebar drawn in the iPad prototype frame.
const PROTOTYPE_RAIL_WIDTH = 168;
const SAMPLE_FEN = "8/3k4/8/8/8/8/4P3/4K3 w - - 1 2";
// Web stand-in for a native material/blur view behind floating chrome.
const CHROME_BLUR = { backdropFilter: "blur(24px) saturate(1.8)" } as unknown as ViewStyle;
const ICON_TILE = 30;
const ROW_ICON_INSET = ICON_TILE + 12;

type Theme = { d: VisualDirection; c: ColorRoles; appearance: Appearance };

const ThemeContext = createContext<Theme | null>(null);

function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error("Visual direction primitives need a ThemeContext.");
  }
  return theme;
}

function ThemeScope({ appearance, children }: React.PropsWithChildren<{ appearance: Appearance }>): React.JSX.Element {
  return (
    <ThemeContext.Provider value={{ d: GROUPED_NATIVE, c: GROUPED_NATIVE.colors[appearance], appearance }}>
      {children}
    </ThemeContext.Provider>
  );
}

function fontFor(direction: VisualDirection, role: TypeRole): TextStyle {
  const style = direction.type[role];
  return {
    fontFamily: SYSTEM_FONT,
    fontSize: style.size,
    lineHeight: style.lineHeight,
    fontWeight: style.weight,
    letterSpacing: style.tracking ?? 0,
    ...(style.tabular ? { fontVariant: ["tabular-nums"] as TextStyle["fontVariant"] } : null)
  };
}

type ColorRole = keyof ColorRoles;
type Tone = "accent" | "positive" | "negative" | "warning";

function T({
  children,
  color = "textPrimary",
  numberOfLines,
  role,
  style
}: React.PropsWithChildren<{
  color?: ColorRole;
  numberOfLines?: number;
  role: TypeRole;
  style?: StyleProp<TextStyle>;
}>): React.JSX.Element {
  const { c, d } = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[fontFor(d, role), { color: c[color] }, style]}>
      {children}
    </Text>
  );
}

function Icon({
  color,
  name,
  size = 22,
  strokeWidth
}: {
  color: string;
  name: LucideIconName;
  size?: number;
  strokeWidth?: number;
}): React.JSX.Element {
  const { d } = useTheme();
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth ?? d.iconStroke}
      viewBox="0 0 24 24"
      width={size}
    >
      {LUCIDE_ICONS[name].map(([tag, attributes], index) =>
        React.createElement(tag, { key: index, ...attributes })
      )}
    </svg>
  );
}

/** Leading row icon: a tinted tile, as in iOS Settings but with a soft tint. */
function IconTile({ name, tone = "accent" }: { name: LucideIconName; tone?: Tone }): React.JSX.Element {
  const { c } = useTheme();
  const foreground = tone === "accent" ? c.accentText : c[tone];
  const soft = tone === "accent" ? c.accentSoft : c[`${tone}Soft`];
  return (
    <View style={{ alignItems: "center", backgroundColor: soft, borderRadius: 8, height: ICON_TILE, justifyContent: "center", width: ICON_TILE }}>
      <Icon color={foreground} name={name} size={18} />
    </View>
  );
}

function floatingShadow(theme: Theme): ViewStyle {
  const shadow = theme.d.elevation.floating;
  return {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: shadow.offsetY },
    shadowOpacity: theme.appearance === "dark" ? Math.min(0.5, shadow.opacity * 3) : shadow.opacity,
    shadowRadius: shadow.radius
  };
}

/** An inset grouped section: one opaque surface on the grouped background, no border. */
function Section({
  children,
  padded = false,
  style
}: React.PropsWithChildren<{ padded?: boolean; style?: StyleProp<ViewStyle> }>): React.JSX.Element {
  const { c, d } = useTheme();
  return (
    <View style={[{ backgroundColor: c.surface, borderRadius: d.radius.card, overflow: "hidden" }, padded ? { padding: 16 } : null, style]}>
      {children}
    </View>
  );
}

function SectionHeader({ title, trailing }: { title: string; trailing?: React.ReactNode }): React.JSX.Element {
  return (
    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 8, minHeight: 28, paddingHorizontal: 4 }}>
      <T role="title">{title}</T>
      {trailing}
    </View>
  );
}

function Separator({ inset = 0 }: { inset?: number }): React.JSX.Element {
  const { c } = useTheme();
  return <View style={{ backgroundColor: c.separator, height: 1, marginLeft: inset }} />;
}

function Chevron(): React.JSX.Element {
  const { c } = useTheme();
  return <Icon color={c.textSecondary} name="chevron-right" size={18} />;
}

function Row({
  icon,
  iconTone,
  selected = false,
  subtitle,
  title,
  trailing
}: {
  icon?: LucideIconName;
  iconTone?: Tone;
  selected?: boolean;
  subtitle?: string;
  title: string;
  trailing?: React.ReactNode;
}): React.JSX.Element {
  const { c, d } = useTheme();
  return (
    <Pressable
      accessibilityLabel={[title, subtitle].filter(Boolean).join(", ")}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{ alignItems: "center", flexDirection: "row", gap: 12, minHeight: d.rowMinHeight, paddingHorizontal: 16, paddingVertical: 10 }}
    >
      {icon ? <IconTile name={icon} tone={iconTone} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T role="headline">{title}</T>
        {subtitle ? <T color="textSecondary" role="subheadline">{subtitle}</T> : null}
      </View>
      {trailing}
      {selected ? <Icon color={c.accentText} name="check" size={20} strokeWidth={2.5} /> : null}
    </Pressable>
  );
}

function RowGroup({ children, iconInset = 0 }: React.PropsWithChildren<{ iconInset?: number }>): React.JSX.Element {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <Section>
      {items.map((child, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <Separator inset={16 + iconInset} /> : null}
          {child}
        </React.Fragment>
      ))}
    </Section>
  );
}

type ButtonVariant = "primary" | "secondary" | "plain" | "destructive";

function Button({
  disabled = false,
  icon,
  label,
  size = "regular",
  stretch = false,
  variant = "primary"
}: {
  disabled?: boolean;
  icon?: LucideIconName;
  label: string;
  size?: "regular" | "compact";
  stretch?: boolean;
  variant?: ButtonVariant;
}): React.JSX.Element {
  const { c, d } = useTheme();
  const height = size === "regular" ? 52 : MIN_TARGET;
  const palette: Record<ButtonVariant, { bg: string; fg: string }> = {
    primary: { bg: c.accent, fg: c.onAccent },
    secondary: { bg: c.accentSoft, fg: c.accentText },
    plain: { bg: "transparent", fg: c.accentText },
    destructive: { bg: c.negativeSoft, fg: c.negative }
  };
  const colors = palette[variant];
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={({ pressed }) => ({
        alignItems: "center",
        alignSelf: stretch ? "stretch" : "flex-start",
        backgroundColor: colors.bg,
        borderRadius: d.radius.control,
        flexDirection: "row",
        gap: 6,
        height,
        justifyContent: "center",
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        paddingHorizontal: variant === "plain" ? 8 : size === "regular" ? 24 : 16
      })}
    >
      {icon ? <Icon color={colors.fg} name={icon} size={18} strokeWidth={2.25} /> : null}
      <Text style={[fontFor(d, "headline"), { color: colors.fg }]}>{label}</Text>
    </Pressable>
  );
}

/** Circular 44-pt glass button used for navigation-bar and session actions. */
function IconButton({ icon, label }: { icon: LucideIconName; label: string }): React.JSX.Element {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      style={{
        alignItems: "center",
        backgroundColor: c.chrome,
        borderColor: c.chromeStroke,
        borderRadius: MIN_TARGET / 2,
        borderWidth: 1,
        height: MIN_TARGET,
        justifyContent: "center",
        width: MIN_TARGET,
        ...CHROME_BLUR
      }}
    >
      <Icon color={c.textPrimary} name={icon} size={22} />
    </Pressable>
  );
}

function Segmented({ options, selected }: { options: readonly string[]; selected: number }): React.JSX.Element {
  const { c, d } = useTheme();
  const [active, setActive] = useState(selected);
  return (
    <View accessibilityRole="tablist" style={{ backgroundColor: c.separator, borderRadius: 999, flexDirection: "row", padding: 3 }}>
      {options.map((option, index) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: index === active }}
          key={option}
          style={{
            alignItems: "center",
            backgroundColor: index === active ? c.surfaceRaised : "transparent",
            borderRadius: 999,
            flex: 1,
            justifyContent: "center",
            minHeight: MIN_TARGET - 6
          }}
          onPress={() => setActive(index)}
        >
          <Text style={[fontFor(d, "subheadline"), { color: c.textPrimary, fontWeight: index === active ? "600" : "400" }]}>{option}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Badge({ label, tone = "accent" }: { label: string; tone?: Tone | "neutral" }): React.JSX.Element {
  const { c, d } = useTheme();
  const fg = tone === "accent" ? c.accentText : tone === "neutral" ? c.textSecondary : c[tone];
  const bg = tone === "accent" ? c.accentSoft : tone === "neutral" ? "transparent" : c[`${tone}Soft`];
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: bg,
        borderColor: tone === "neutral" ? fg : "transparent",
        borderRadius: d.radius.badge,
        borderWidth: tone === "neutral" ? 1 : 0,
        paddingHorizontal: 8,
        paddingVertical: 2
      }}
    >
      <Text style={[fontFor(d, "caption"), { color: fg, fontWeight: "600" }]}>{label}</Text>
    </View>
  );
}

/** Black or white, whichever reads better on an opaque fill. */
function readableOn(fill: string): string {
  const color = parseColor(fill);
  return contrastRatio(parseColor("#FFFFFF"), color) >= contrastRatio(parseColor("#000000"), color)
    ? "#FFFFFF"
    : "#000000";
}

function CountBadge({ count }: { count: number }): React.JSX.Element {
  const { c, d } = useTheme();
  return (
    <View style={{ alignItems: "center", backgroundColor: c.negative, borderRadius: 9, height: 18, justifyContent: "center", minWidth: 18, paddingHorizontal: 5 }}>
      <Text style={[fontFor(d, "caption"), { color: readableOn(c.negative), fontWeight: "700", lineHeight: 14 }]}>{count}</Text>
    </View>
  );
}

function Switch({ on }: { on: boolean }): React.JSX.Element {
  const { c } = useTheme();
  const [value, setValue] = useState(on);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={{ height: MIN_TARGET, justifyContent: "center" }}
      onPress={() => setValue((current) => !current)}
    >
      <View style={{ backgroundColor: value ? c.accent : c.separator, borderRadius: 16, height: 31, justifyContent: "center", paddingHorizontal: 2, width: 51 }}>
        <View
          style={{
            alignSelf: value ? "flex-end" : "flex-start",
            backgroundColor: "#FFFFFF",
            borderRadius: 14,
            height: 27,
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 4,
            width: 27
          }}
        />
      </View>
    </Pressable>
  );
}

function MistakePips({ used }: { used: number }): React.JSX.Element {
  const { c } = useTheme();
  return (
    <View accessibilityLabel={`${used} of 3 mistakes`} accessible style={{ flexDirection: "row", gap: 6 }}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={{
            backgroundColor: index < used ? c.negative : "transparent",
            borderColor: index < used ? c.negative : c.textSecondary,
            borderRadius: 6,
            borderWidth: 1.5,
            height: 12,
            width: 12
          }}
        />
      ))}
    </View>
  );
}

function ScoreStrip({ left, mistakes, solved }: { left: number; mistakes: number; solved: number }): React.JSX.Element {
  const { c, d } = useTheme();
  const metric = (icon: LucideIconName, value: number, color: string, label: string): React.JSX.Element => (
    <View accessibilityLabel={`${label} ${value}`} accessible style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
      <Icon color={color} name={icon} size={22} />
      <Text style={[fontFor(d, "numeralL"), { color: c.textPrimary, fontSize: 20, lineHeight: 26 }]}>{value}</Text>
    </View>
  );
  return (
    <Section style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-around", minHeight: 52 }}>
      {metric("circle-check", solved, c.positive, "Solved")}
      {metric("circle-x", mistakes, c.negative, "Mistakes")}
      {metric("circle-minus", left, c.textSecondary, "Left")}
    </Section>
  );
}

function SideToMoveDisc({ side }: { side: "white" | "black" }): React.JSX.Element {
  const { c } = useTheme();
  return (
    <View style={{ backgroundColor: side === "white" ? "#FFFFFF" : "#111111", borderColor: c.textSecondary, borderRadius: 9, borderWidth: 1.5, height: 18, width: 18 }} />
  );
}

function Board({ size }: { size: number }): React.JSX.Element {
  const { c } = useTheme();
  return (
    <View style={{ alignSelf: "center", borderColor: c.boardFrame, borderRadius: 8, borderWidth: 1, height: size + 2, overflow: "hidden", width: size + 2 }}>
      <BoardPlaceholder boardSize={size} fen={SAMPLE_FEN} gestureEnabled={false} />
    </View>
  );
}

/* ----------------------------------------------------------------------------
 * Device frames and navigation chrome
 * ------------------------------------------------------------------------- */

function StatusBar(): React.JSX.Element {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", height: 54, justifyContent: "space-between", paddingHorizontal: 32, paddingTop: 8 }}>
      <Text style={{ color: c.textPrimary, fontFamily: SYSTEM_FONT, fontSize: 16, fontWeight: "600" }}>9:41</Text>
      <View style={{ backgroundColor: "#000000", borderRadius: 18, height: 34, width: 120 }} />
      <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
        {[5, 8, 11].map((height) => (
          <View key={height} style={{ backgroundColor: c.textPrimary, borderRadius: 1, height, width: 3 }} />
        ))}
        <View style={{ borderColor: c.textPrimary, borderRadius: 4, borderWidth: 1.5, height: 12, marginLeft: 4, padding: 1.5, width: 25 }}>
          <View style={{ backgroundColor: c.textPrimary, borderRadius: 1.5, flex: 1, width: "80%" }} />
        </View>
      </View>
    </View>
  );
}

function PhoneFrame({
  children,
  label,
  tabBar,
  width
}: React.PropsWithChildren<{ label: string; tabBar?: React.ReactNode; width: number }>): React.JSX.Element {
  const { c } = useTheme();
  return (
    <View
      accessibilityLabel={label}
      style={{ backgroundColor: c.background, borderColor: "rgba(0,0,0,0.25)", borderRadius: 44, borderWidth: 1, height: PHONE_HEIGHT, overflow: "hidden", width }}
    >
      <StatusBar />
      <View style={{ flex: 1 }}>{children}</View>
      {tabBar}
    </View>
  );
}

/** Renders a fixed-size iPad canvas scaled to fit the available width without changing its layout. */
function ScaledCanvas({
  children,
  height,
  maxWidth,
  width
}: React.PropsWithChildren<{ height: number; maxWidth: number; width: number }>): React.JSX.Element {
  const scale = Math.min(1, maxWidth / width);
  return (
    <View style={{ height: height * scale, overflow: "hidden", width: width * scale }}>
      <View
        style={{
          height,
          transform: [{ translateX: (-width * (1 - scale)) / 2 }, { translateY: (-height * (1 - scale)) / 2 }, { scale }],
          width
        }}
      >
        {children}
      </View>
    </View>
  );
}

const PRIMARY_TABS: readonly { icon: LucideIconName; label: string; badge?: number }[] = [
  { icon: "target", label: "Practice" },
  { icon: "rotate-ccw", label: "Review", badge: 12 },
  { icon: "history", label: "History" },
  { icon: "settings", label: "Settings" }
];

/** iOS 26 floating glass tab bar. Content scrolls beneath it. */
function TabBar(): React.JSX.Element {
  const theme = useTheme();
  const { c, d } = theme;
  return (
    <View style={{ bottom: 0, left: 0, paddingBottom: 22, paddingHorizontal: 20, position: "absolute", right: 0 }}>
      <View
        style={{
          backgroundColor: c.chrome,
          borderColor: c.chromeStroke,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          padding: 4,
          ...CHROME_BLUR,
          ...floatingShadow(theme)
        }}
      >
        {PRIMARY_TABS.map((tab, index) => {
          const active = index === 0;
          const color = active ? c.accentText : c.textSecondary;
          return (
            <Pressable
              accessibilityLabel={`${tab.label} tab${tab.badge ? `, ${tab.badge} due reviews` : ""}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={tab.label}
              style={{ alignItems: "center", borderRadius: 999, flex: 1, gap: 2, justifyContent: "center", minHeight: 52, paddingHorizontal: 4 }}
            >
              <View>
                <Icon color={color} name={tab.icon} size={24} strokeWidth={active ? 2.25 : d.iconStroke} />
                {tab.badge ? (
                  <View style={{ position: "absolute", right: -12, top: -6 }}>
                    <CountBadge count={tab.badge} />
                  </View>
                ) : null}
              </View>
              <Text style={[fontFor(d, "caption"), { color, fontSize: 11, fontWeight: active ? "600" : "500", lineHeight: 13 }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Regular-width sidebar rail with labels, as in iPadOS sidebars. */
function NavigationRail({ width }: { width: number }): React.JSX.Element {
  const { c, d } = useTheme();
  return (
    <View style={{ backgroundColor: c.surface, borderRightColor: c.separator, borderRightWidth: 1, gap: 4, paddingHorizontal: 12, paddingTop: 32, width }}>
      {PRIMARY_TABS.map((tab, index) => {
        const active = index === 0;
        const color = active ? c.accentText : c.textPrimary;
        return (
          <Pressable
            accessibilityLabel={`${tab.label} tab`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={tab.label}
            style={{
              alignItems: "center",
              backgroundColor: active ? c.accentSoft : "transparent",
              borderRadius: d.radius.control,
              flexDirection: "row",
              gap: 12,
              minHeight: MIN_TARGET + 4,
              paddingHorizontal: 12
            }}
          >
            <Icon color={active ? color : c.textSecondary} name={tab.icon} size={22} />
            <Text style={[fontFor(d, "headline"), { color, flex: 1, fontWeight: active ? "600" : "400" }]}>{tab.label}</Text>
            {tab.badge ? <CountBadge count={tab.badge} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ----------------------------------------------------------------------------
 * Screens (same information architecture and copy as the current app)
 * ------------------------------------------------------------------------- */

function RunsBlock(): React.JSX.Element {
  const { d } = useTheme();
  return (
    <View style={{ gap: d.spacing.group }}>
      <SectionHeader title="Start a Run" trailing={<Button icon="play" label="Start" size="compact" />} />
      <T color="textSecondary" role="subheadline" style={{ paddingHorizontal: 4 }}>
        Choose a run, then start when you are ready.
      </T>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <HelpLink />
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Button label="Edit" size="compact" variant="plain" />
          <Button icon="plus" label="Add Run" size="compact" variant="plain" />
        </View>
      </View>
      <RowGroup iconInset={ROW_ICON_INSET}>
        <Row icon="target" selected subtitle="Find the best move" title="Standard" trailing={<RatingValue value={925} />} />
        <Row icon="move-up-right" subtitle="Choose the best move" title="Arrow Duel" trailing={<RatingValue value={875} />} />
        <Row icon="sliders-horizontal" subtitle="3 min · Forks · 15 sec per puzzle" title="Quick Forks" trailing={<RatingValue value={1010} />} />
      </RowGroup>
    </View>
  );
}

function HelpLink(): React.JSX.Element {
  const { c } = useTheme();
  return (
    <Pressable accessibilityLabel="How Sprint works" accessibilityRole="button" style={{ alignItems: "center", flexDirection: "row", gap: 6, minHeight: MIN_TARGET, paddingHorizontal: 4 }}>
      <Icon color={c.accentText} name="circle-help" size={18} />
      <T color="accentText" role="subheadline">How Sprint works</T>
    </Pressable>
  );
}

function RatingValue({ value }: { value: number }): React.JSX.Element {
  const { c, d } = useTheme();
  return (
    <View accessibilityLabel={`Rating ${value}`} accessible style={{ alignItems: "flex-end" }}>
      <Text style={[fontFor(d, "numeralL"), { color: c.textPrimary, fontSize: 20, lineHeight: 26 }]}>{value}</Text>
    </View>
  );
}

function ProgressBlock(): React.JSX.Element {
  const { d } = useTheme();
  const metric = (label: string, value: string, detail: string, tone: ColorRole): React.JSX.Element => (
    <View style={{ flex: 1, gap: 2 }}>
      <T color="textSecondary" role="footnote">{label}</T>
      <T role="numeralXL" style={{ fontSize: 28, lineHeight: 34 }}>{value}</T>
      <T color={tone} role="footnote">{detail}</T>
    </View>
  );
  return (
    <View style={{ gap: d.spacing.group }}>
      <SectionHeader title="Progress" />
      <Section padded style={{ flexDirection: "row", gap: 16 }}>
        {metric("Standard rating", "925", "+18 this week", "positive")}
        {metric("This Week", "46", "puzzles · 84% solved", "textSecondary")}
      </Section>
    </View>
  );
}

function SecondaryBlock(): React.JSX.Element {
  const { c, d } = useTheme();
  return (
    <View style={{ gap: d.spacing.section }}>
      <RowGroup iconInset={ROW_ICON_INSET}>
        <Row icon="shield" subtitle="See how far you can go, at your own pace." title="Survival Challenge" trailing={<Chevron />} />
      </RowGroup>
      <View style={{ gap: d.spacing.group }}>
        <SectionHeader title="Training Focus" />
        <Section padded style={{ gap: 8 }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Badge label="Recommended" />
            <Icon color={c.textSecondary} name="crosshair" size={20} />
          </View>
          <T role="headline">Pins may need attention</T>
          <T color="textSecondary" role="subheadline">Solved less often than your other themes across 6 sessions.</T>
          <View style={{ marginTop: 4 }}>
            <Button label="Start Focused Run" size="compact" variant="secondary" />
          </View>
        </Section>
      </View>
      <RowGroup iconInset={ROW_ICON_INSET}>
        <Row icon="chart-no-axes-column" subtitle="Strengths and focus areas by theme" title="Tactical Profile" trailing={<Chevron />} />
      </RowGroup>
    </View>
  );
}

export function PracticeHomeScreen({ width }: { width: number }): React.JSX.Element {
  const { d } = useTheme();
  return (
    <PhoneFrame label="Practice Home" tabBar={<TabBar />} width={width}>
      <ScrollView contentContainerStyle={{ gap: d.spacing.section, paddingBottom: 120, paddingHorizontal: d.spacing.screen, paddingTop: 8 }}>
        <T role="largeTitle">Practice</T>
        <RunsBlock />
        <ProgressBlock />
        <SecondaryBlock />
      </ScrollView>
    </PhoneFrame>
  );
}

function regularLandscapeLayout(): ReturnType<typeof buildPracticeAdaptiveLayout> {
  return buildPracticeAdaptiveLayout({
    fontScale: 1,
    height: IPAD_HEIGHT,
    insets: { top: 0, right: 0, bottom: 20, left: 0 },
    width: IPAD_WIDTH
  });
}

export function PracticeHomeWide(): React.JSX.Element {
  const { c, d } = useTheme();
  const layout = regularLandscapeLayout();
  return (
    <View accessibilityLabel="Practice Home, iPad landscape" style={{ backgroundColor: c.background, flexDirection: "row", height: IPAD_HEIGHT, width: IPAD_WIDTH }}>
      <NavigationRail width={PROTOTYPE_RAIL_WIDTH} />
      <ScrollView contentContainerStyle={{ gap: d.spacing.section, padding: 32 }} style={{ flex: 1 }}>
        <T role="largeTitle">Practice</T>
        <View style={{ flexDirection: "row", gap: 32 }}>
          <View style={{ flex: 1.15, gap: d.spacing.section }}>
            <RunsBlock />
          </View>
          <View style={{ flex: 1, gap: d.spacing.section }}>
            <ProgressBlock />
            <SecondaryBlock />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SessionHeader(): React.JSX.Element {
  return (
    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
      <IconButton icon="x" label="Abandon sprint" />
      <T role="headline">Standard</T>
      <IconButton icon="pause" label="Pause sprint" />
    </View>
  );
}

function SessionStatus(): React.JSX.Element {
  const { d } = useTheme();
  const column = (child: React.ReactNode, label: string): React.JSX.Element => (
    <View style={{ alignItems: "center", flex: 1, gap: 2 }}>
      <View style={{ height: d.type.numeralL.lineHeight, justifyContent: "center" }}>{child}</View>
      <T color="textSecondary" role="caption">{label}</T>
    </View>
  );
  return (
    <Section style={{ flexDirection: "row", paddingVertical: 10 }}>
      {column(<T role="numeralL">6/15</T>, "Solved")}
      {column(<T role="numeralL">03:12</T>, "Time left")}
      {column(<MistakePips used={1} />, "Mistakes")}
    </Section>
  );
}

function SessionPrompt(): React.JSX.Element {
  return (
    <Section padded style={{ alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 12 }}>
      <SideToMoveDisc side="white" />
      <View style={{ flex: 1 }}>
        <T role="headline">Find the best move</T>
        <T color="textSecondary" role="subheadline">For white.</T>
      </View>
    </Section>
  );
}

function PuzzleClock(): React.JSX.Element {
  return <T color="textSecondary" role="footnote" style={{ fontVariant: ["tabular-nums"], textAlign: "center" }}>Puzzle 0:14</T>;
}

export function SessionHudScreen({ width }: { width: number }): React.JSX.Element {
  const { d } = useTheme();
  const boardSize = Math.floor(width - d.spacing.screen * 2 - 2);
  return (
    <PhoneFrame label="Standard Sprint in session" width={width}>
      <View style={{ flex: 1, gap: d.spacing.row, paddingHorizontal: d.spacing.screen, paddingTop: 4 }}>
        <SessionHeader />
        <SessionStatus />
        <SessionPrompt />
        <Board size={boardSize} />
        <PuzzleClock />
        <ScoreStrip left={9} mistakes={1} solved={6} />
      </View>
    </PhoneFrame>
  );
}

export function SessionHudWide(): React.JSX.Element {
  const { c } = useTheme();
  const layout = regularLandscapeLayout();
  return (
    <View
      accessibilityLabel="Standard Sprint in session, iPad landscape"
      style={{ alignItems: "center", backgroundColor: c.background, flexDirection: "row", gap: layout.sessionRailGap, height: IPAD_HEIGHT, justifyContent: "center", paddingBottom: 20, width: IPAD_WIDTH }}
    >
      <Board size={layout.boardSize} />
      <View style={{ gap: 16, height: layout.boardSize, width: layout.sessionRailWidth }}>
        <SessionHeader />
        <SessionStatus />
        <SessionPrompt />
        <View style={{ flex: 1 }} />
        <PuzzleClock />
        <ScoreStrip left={9} mistakes={1} solved={6} />
      </View>
    </View>
  );
}

function ResultMetrics(): React.JSX.Element {
  const { c } = useTheme();
  const tabular: TextStyle = { fontVariant: ["tabular-nums"] };
  return (
    <RowGroup>
      <Row
        title="Rating Change"
        trailing={(
          <View style={{ alignItems: "flex-end" }}>
            <T color="negative" role="headline" style={tabular}>−17</T>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
              <T color="textSecondary" role="footnote" style={tabular}>1087</T>
              <Icon color={c.textSecondary} name="arrow-right" size={14} />
              <T color="textSecondary" role="footnote" style={tabular}>1070</T>
            </View>
          </View>
        )}
      />
      <Row title="Time" trailing={<T color="textSecondary" role="body" style={tabular}>05:00</T>} />
      <Row title="Best Streak" trailing={<T color="textSecondary" role="body" style={tabular}>6</T>} />
      <Row icon="chart-spline" subtitle="View performance trend" title="History" trailing={<Chevron />} />
    </RowGroup>
  );
}

export function SprintResultScreen({
  scrolledToActions = false,
  width
}: {
  scrolledToActions?: boolean;
  width: number;
}): React.JSX.Element {
  const { d } = useTheme();
  const scrollRef = React.useRef<ScrollView>(null);
  React.useEffect(() => {
    if (!scrolledToActions) {
      return undefined;
    }
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(timer);
  }, [scrolledToActions]);
  return (
    <PhoneFrame label={scrolledToActions ? "Sprint Result, scrolled to actions" : "Sprint Result"} tabBar={<TabBar />} width={width}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: d.spacing.screen - 4 }}>
        <IconButton icon="chevron-left" label="Back to Practice" />
        <T role="headline">Sprint Result</T>
        <IconButton icon="chart-spline" label="View performance trend" />
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={{ gap: 20, paddingBottom: 112, paddingHorizontal: d.spacing.screen, paddingTop: 12 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
          <IconTile name="circle-x" tone="negative" />
          <View style={{ flex: 1 }}>
            <T role="title">Sprint failed</T>
            <T color="textSecondary" role="subheadline">Time expired</T>
          </View>
        </View>
        <Section padded style={{ gap: 4 }}>
          <T color="accentText" role="footnote" style={{ fontWeight: "600" }}>Solve 15 to pass</T>
          <T role="title">Solved 11</T>
          <T color="textSecondary" role="subheadline">12 attempted · 92% Accuracy</T>
        </Section>
        <ResultMetrics />
        <View style={{ gap: d.spacing.group }}>
          <RowGroup>
            <ReplayRow count={2} detail="1 marked by you · 1 marked after Slow" note="Included in replay · Does not affect your Sprint result" title="Unclear" tone="warning" />
            <ReplayRow count={2} detail="2 attempts · Included in replay" title="In Review" tone="negative" />
          </RowGroup>
          <T color="textSecondary" role="footnote" style={{ paddingHorizontal: 16 }}>
            2 Unclear + 2 in Review · 4 total · Replay does not change Review scheduling
          </T>
        </View>
        <View style={{ gap: 4 }}>
          <Button label="Replay 4 attempts" stretch />
          <Button label="Play again" stretch variant="plain" />
        </View>
      </ScrollView>
    </PhoneFrame>
  );
}

function ReplayRow({
  count,
  detail,
  note,
  title,
  tone
}: {
  count: number;
  detail: string;
  note?: string;
  title: string;
  tone: "warning" | "negative";
}): React.JSX.Element {
  const { c, d } = useTheme();
  return (
    <View accessibilityLabel={`${title}, ${count}. ${detail}`} accessible style={{ alignItems: "center", flexDirection: "row", gap: 12, minHeight: d.rowMinHeight, paddingHorizontal: 16, paddingVertical: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T role="headline">{title}</T>
        <T color="textSecondary" role="subheadline">{detail}</T>
        {note ? <T color={tone} role="footnote">{note}</T> : null}
      </View>
      <View style={{ alignItems: "center", backgroundColor: c[`${tone}Soft`], borderRadius: 18, height: 36, justifyContent: "center", minWidth: 36 }}>
        <Text style={[fontFor(d, "numeralL"), { color: c[tone], fontSize: 20, lineHeight: 24 }]}>{count}</Text>
      </View>
    </View>
  );
}

/* ----------------------------------------------------------------------------
 * Token sheet and primitive specimens
 * ------------------------------------------------------------------------- */

const TYPE_ROLE_LABELS: Record<TypeRole, string> = {
  largeTitle: "Large title",
  title: "Title",
  headline: "Headline",
  body: "Body",
  subheadline: "Subheadline",
  footnote: "Footnote",
  caption: "Caption",
  numeralXL: "Numeral XL",
  numeralL: "Numeral L",
  numeralRow: "Numeral row"
};

const TYPE_ROLE_SAMPLES: Record<TypeRole, string> = {
  largeTitle: "Practice",
  title: "Start a Run",
  headline: "Find the best move",
  body: "Choose a run, then start when you are ready.",
  subheadline: "See how far you can go, at your own pace.",
  footnote: "12 attempted · 92% Accuracy",
  caption: "Mistakes",
  numeralXL: "03:12  925",
  numeralL: "03:12  925",
  numeralRow: "925  1040"
};

const WEIGHT_NAMES: Record<string, string> = {
  "300": "Light",
  "400": "Regular",
  "500": "Medium",
  "600": "Semibold",
  "700": "Bold"
};

function SpecimenLabel({ children }: React.PropsWithChildren): React.JSX.Element {
  return <T color="textSecondary" role="footnote" style={{ fontWeight: "600", marginBottom: 8, marginTop: 24 }}>{children}</T>;
}

function TypeScaleSpecimen(): React.JSX.Element {
  const { d } = useTheme();
  return (
    <Section padded style={{ gap: 12 }}>
      {(Object.keys(TYPE_ROLE_LABELS) as TypeRole[]).map((role) => {
        const style = d.type[role];
        return (
          <View key={role} style={{ gap: 2 }}>
            <T numberOfLines={1} role={role}>{TYPE_ROLE_SAMPLES[role]}</T>
            <T color="textSecondary" role="caption">
              {`${TYPE_ROLE_LABELS[role]} · ${style.size}/${style.lineHeight} · ${WEIGHT_NAMES[style.weight]}${style.tabular ? " · Tabular" : ""}`}
            </T>
          </View>
        );
      })}
    </Section>
  );
}

const COLOR_ROLE_ORDER: ColorRole[] = [
  "background",
  "surface",
  "surfaceRaised",
  "separator",
  "textPrimary",
  "textSecondary",
  "accent",
  "accentText",
  "accentSoft",
  "positive",
  "negative",
  "warning",
  "chrome"
];

const TEXT_ROLES: readonly ColorRole[] = ["textPrimary", "textSecondary", "accentText", "positive", "negative", "warning"];

function ColorSpecimen(): React.JSX.Element {
  const { c } = useTheme();
  const background = compositeOver(c.background, "#FFFFFF");
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {COLOR_ROLE_ORDER.map((role) => {
        const ratio = TEXT_ROLES.includes(role) ? contrastRatio(parseColor(c[role]), background) : null;
        return (
          <View key={role} style={{ gap: 4, width: 104 }}>
            <View style={{ backgroundColor: c[role], borderColor: c.separator, borderRadius: 10, borderWidth: 1, height: 44 }} />
            <T role="caption" style={{ fontWeight: "600" }}>{role}</T>
            <T color="textSecondary" numberOfLines={1} role="caption">{c[role].replace(/\s/g, "")}</T>
            {ratio ? <T color="textSecondary" role="caption">{`${ratio.toFixed(1)}:1 on bg`}</T> : null}
          </View>
        );
      })}
    </View>
  );
}

function ShapeSpecimen(): React.JSX.Element {
  const { c, d } = useTheme();
  const radii: [string, number][] = [
    ["control", d.radius.control],
    ["card", d.radius.card],
    ["sheet", d.radius.sheet]
  ];
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {radii.map(([label, radius]) => (
          <View key={label} style={{ alignItems: "center", gap: 4 }}>
            <View style={{ backgroundColor: c.accentSoft, borderColor: c.accentText, borderRadius: Math.min(radius, 32), borderWidth: 1.5, height: 64, width: 72 }} />
            <T color="textSecondary" role="caption">{`${label} ${radius}`}</T>
          </View>
        ))}
      </View>
      <View style={{ alignItems: "flex-end", flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {SPACING_SCALE.map((value) => (
          <View key={value} style={{ alignItems: "center", gap: 4 }}>
            <View style={{ backgroundColor: c.accent, borderRadius: 2, height: value, width: value }} />
            <T color="textSecondary" role="caption">{value}</T>
          </View>
        ))}
      </View>
      <T color="textSecondary" role="footnote">
        {`Screen padding ${d.spacing.screen} · section gap ${d.spacing.section} · group gap ${d.spacing.group} · row gap ${d.spacing.row} · row height ≥ ${d.rowMinHeight} · targets ≥ ${MIN_TARGET}`}
      </T>
    </View>
  );
}

function SurfaceSpecimen(): React.JSX.Element {
  const theme = useTheme();
  const { c, d } = theme;
  const tile = (label: string, style: ViewStyle): React.JSX.Element => (
    <View style={[{ flexBasis: 120, flexGrow: 1, minHeight: 72, padding: 12 }, style]}>
      <T color="textSecondary" role="caption">{label}</T>
    </View>
  );
  return (
    <View style={{ backgroundColor: c.background, borderColor: c.separator, borderRadius: 16, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 12, padding: 16 }}>
      {tile("surface: sections", { backgroundColor: c.surface, borderRadius: d.radius.card })}
      {tile("surfaceRaised: sheets, popovers", { backgroundColor: c.surfaceRaised, borderRadius: d.radius.sheet / 2, ...floatingShadow(theme) })}
      {tile("chrome: tab bar, floating controls", { backgroundColor: c.chrome, borderColor: c.chromeStroke, borderRadius: 36, borderWidth: 1, ...CHROME_BLUR, ...floatingShadow(theme) })}
    </View>
  );
}

function IconSpecimen(): React.JSX.Element {
  const { c } = useTheme();
  const names = Object.keys(LUCIDE_ICONS) as LucideIconName[];
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <IconTile name="target" />
        <IconTile name="shield" />
        <IconTile name="circle-check" tone="positive" />
        <IconTile name="circle-x" tone="negative" />
        <IconTile name="timer" tone="warning" />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {names.map((name) => (
          <View key={name} style={{ alignItems: "center", gap: 2, paddingVertical: 6, width: 72 }}>
            <Icon color={c.textPrimary} name={name} size={24} />
            <T color="textSecondary" numberOfLines={1} role="caption" style={{ fontSize: 10, lineHeight: 13 }}>{name}</T>
          </View>
        ))}
      </View>
    </View>
  );
}

function PrimitiveSpecimens(): React.JSX.Element {
  const { d } = useTheme();
  return (
    <View>
      <SpecimenLabel>Buttons</SpecimenLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button label="Start" />
        <Button label="Play again" variant="secondary" />
        <Button label="Edit" variant="plain" />
        <Button label="Abandon" variant="destructive" />
        <Button disabled label="Start" />
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        <IconButton icon="x" label="Close" />
        <IconButton icon="pause" label="Pause" />
        <IconButton icon="chart-spline" label="Trend" />
        <Button icon="plus" label="Add Run" size="compact" variant="plain" />
      </View>
      <SpecimenLabel>Section with list rows</SpecimenLabel>
      <RowGroup iconInset={ROW_ICON_INSET}>
        <Row icon="target" selected subtitle="Find the best move" title="Standard" trailing={<RatingValue value={925} />} />
        <Row icon="shield" subtitle="See how far you can go, at your own pace." title="Survival Challenge" trailing={<Chevron />} />
        <Row icon="settings" title="Move sounds" trailing={<Switch on />} />
      </RowGroup>
      <SpecimenLabel>Segmented control</SpecimenLabel>
      <Segmented options={["All", "Needs attention"]} selected={0} />
      <SpecimenLabel>Badges and status</SpecimenLabel>
      <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Badge label="Recommended" />
        <Badge label="Solved" tone="positive" />
        <Badge label="In Review" tone="negative" />
        <Badge label="Unclear" tone="warning" />
        <Badge label="Paused" tone="neutral" />
        <CountBadge count={12} />
        <MistakePips used={1} />
      </View>
      <SpecimenLabel>Session score strip</SpecimenLabel>
      <ScoreStrip left={9} mistakes={1} solved={6} />
      <SpecimenLabel>{`Icon sample (Lucide fallback set, ${d.iconStroke}-pt stroke; SF Symbols on iOS)`}</SpecimenLabel>
      <IconSpecimen />
    </View>
  );
}

function TokenSheet(): React.JSX.Element {
  const { appearance, c } = useTheme();
  return (
    <View style={{ backgroundColor: c.background, borderRadius: 24, padding: 20 }}>
      <T role="title">{appearance === "light" ? "Light" : "Dark"}</T>
      <SpecimenLabel>Type scale (system font; Dynamic Type sizes at Large)</SpecimenLabel>
      <TypeScaleSpecimen />
      <SpecimenLabel>Color roles</SpecimenLabel>
      <ColorSpecimen />
      <SpecimenLabel>Radius and 4-pt spacing</SpecimenLabel>
      <ShapeSpecimen />
      <SpecimenLabel>Surfaces and elevation</SpecimenLabel>
      <SurfaceSpecimen />
      <PrimitiveSpecimens />
    </View>
  );
}

/* ----------------------------------------------------------------------------
 * Story pages
 * ------------------------------------------------------------------------- */

function usePageWidth(): number {
  const { width } = useWindowDimensions();
  return Math.max(320, width);
}

function PageShell({ children }: React.PropsWithChildren): React.JSX.Element {
  return (
    <View style={{ backgroundColor: PAGE_BACKGROUND, minHeight: "100%" as unknown as number }}>
      <View style={{ alignSelf: "center", gap: 24, maxWidth: 1240, paddingHorizontal: 12, paddingVertical: 20, width: "100%" }}>{children}</View>
    </View>
  );
}

function DirectionIntro({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const direction = GROUPED_NATIVE;
  const line = (label: string, text: string): React.JSX.Element => (
    <Text style={{ color: PAGE_SECONDARY, fontFamily: SYSTEM_FONT, fontSize: 15, lineHeight: 21 }}>
      <Text style={{ color: PAGE_TEXT, fontWeight: "600" }}>{`${label} `}</Text>
      {text}
    </Text>
  );
  return (
    <View style={{ gap: 6, maxWidth: 760, paddingHorizontal: 4 }}>
      <Text accessibilityRole="header" style={{ color: PAGE_TEXT, fontFamily: SYSTEM_FONT, fontSize: compact ? 22 : 28, fontWeight: "700", lineHeight: compact ? 28 : 34 }}>
        {direction.name}
      </Text>
      <Text style={{ color: PAGE_TEXT, fontFamily: SYSTEM_FONT, fontSize: 16, lineHeight: 22 }}>{direction.rationale}</Text>
      {compact ? null : (
        <>
          {line("Surfaces.", direction.surfaceModel)}
          {line("Motion.", direction.motion)}
          {line("Haptics.", direction.haptics)}
        </>
      )}
    </View>
  );
}

function AppearancePair({ minColumnWidth, render }: { minColumnWidth: number; render: () => React.ReactNode }): React.JSX.Element {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
      {(["light", "dark"] as const).map((appearance) => (
        <View key={appearance} style={{ flexBasis: minColumnWidth, flexGrow: 1, gap: 8, maxWidth: Math.max(minColumnWidth, 620) }}>
          <ThemeScope appearance={appearance}>{render()}</ThemeScope>
        </View>
      ))}
    </View>
  );
}

function ScreenCaption({ children }: React.PropsWithChildren): React.JSX.Element {
  return <Text style={{ color: PAGE_TEXT, fontFamily: SYSTEM_FONT, fontSize: 17, fontWeight: "600", lineHeight: 22, paddingHorizontal: 4 }}>{children}</Text>;
}

function AppearanceLabel(): React.JSX.Element {
  const { appearance } = useTheme();
  return <Text style={{ color: PAGE_SECONDARY, fontFamily: SYSTEM_FONT, fontSize: 13, fontWeight: "600", lineHeight: 18, textAlign: "center" }}>{appearance === "light" ? "Light" : "Dark"}</Text>;
}

export function GroupedNativeTokensPage(): React.JSX.Element {
  return (
    <PageShell>
      <DirectionIntro />
      <AppearancePair minColumnWidth={320} render={() => <TokenSheet />} />
    </PageShell>
  );
}

export function GroupedNativePhonePage(): React.JSX.Element {
  const pageWidth = usePageWidth();
  const frameWidth = Math.min(PHONE_WIDTH, pageWidth - 24);
  const screens: [string, (width: number) => React.ReactNode][] = [
    ["Practice Home", (width) => <PracticeHomeScreen width={width} />],
    ["Session HUD · Standard Sprint", (width) => <SessionHudScreen width={width} />],
    ["Sprint Result", (width) => <SprintResultScreen width={width} />],
    ["Sprint Result · scrolled to actions", (width) => <SprintResultScreen scrolledToActions width={width} />]
  ];
  return (
    <PageShell>
      <DirectionIntro />
      {screens.map(([title, render]) => (
        <View key={title} style={{ gap: 12 }}>
          <ScreenCaption>{title}</ScreenCaption>
          <AppearancePair
            minColumnWidth={frameWidth}
            render={() => (
              <View style={{ alignItems: "center", gap: 6 }}>
                <AppearanceLabel />
                {render(frameWidth)}
              </View>
            )}
          />
        </View>
      ))}
    </PageShell>
  );
}

export function GroupedNativeIpadPage(): React.JSX.Element {
  const pageWidth = usePageWidth();
  const canvasWidth = Math.min(IPAD_WIDTH, pageWidth - 24);
  const screens: [string, () => React.ReactNode][] = [
    ["Practice Home · iPad landscape with navigation rail", () => <PracticeHomeWide />],
    ["Session HUD · iPad landscape board lane and control rail (global navigation hides during sessions)", () => <SessionHudWide />]
  ];
  return (
    <PageShell>
      <DirectionIntro compact />
      {screens.map(([title, render]) => (
        <View key={title} style={{ gap: 12 }}>
          <ScreenCaption>{title}</ScreenCaption>
          {(["light", "dark"] as const).map((appearance) => (
            <ThemeScope appearance={appearance} key={appearance}>
              <View style={{ alignItems: "center", gap: 6 }}>
                <AppearanceLabel />
                <View style={{ borderColor: "rgba(0,0,0,0.25)", borderRadius: 18, borderWidth: 1, overflow: "hidden" }}>
                  <ScaledCanvas height={IPAD_HEIGHT} maxWidth={canvasWidth - 2} width={IPAD_WIDTH}>
                    {render()}
                  </ScaledCanvas>
                </View>
              </View>
            </ThemeScope>
          ))}
        </View>
      ))}
    </PageShell>
  );
}
