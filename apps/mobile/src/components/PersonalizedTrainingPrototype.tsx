import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

/**
 * DESIGN-ONLY PROTOTYPE — issues #245, #250, and #253.
 *
 * Three structural variants answer one question: how should a tactical weakness
 * signal become a multi-theme sprint that can be saved and pinned on Practice?
 * This component is intentionally not wired to navigation, storage, analytics,
 * puzzle selection, or any native boundary.
 */

export const PERSONALIZED_TRAINING_VARIANTS = [
  'coach',
  'workbench',
  'home',
] as const;

export type PersonalizedTrainingVariant =
  (typeof PERSONALIZED_TRAINING_VARIANTS)[number];

export const PERSONALIZED_TRAINING_VARIANT_LABELS: Record<
  PersonalizedTrainingVariant,
  string
> = {
  coach: 'Guided coach',
  workbench: 'Profile workbench',
  home: 'Home-first organizer',
};

type ThemeKey = 'fork' | 'pin' | 'deflection' | 'discovered_attack';

type ThemeSignal = {
  accuracy: number;
  averageSeconds: number;
  attempts: number;
  confidence: 'High' | 'Medium';
  key: ThemeKey;
  label: string;
  relativePace: string;
  tone: 'danger' | 'warning' | 'neutral';
};

const THEME_SIGNALS: readonly ThemeSignal[] = [
  {
    accuracy: 54,
    averageSeconds: 19.4,
    attempts: 31,
    confidence: 'High',
    key: 'fork',
    label: 'Forks',
    relativePace: '6.2s slower than your median',
    tone: 'danger',
  },
  {
    accuracy: 58,
    averageSeconds: 17.1,
    attempts: 24,
    confidence: 'High',
    key: 'pin',
    label: 'Pins',
    relativePace: '3.9s slower than your median',
    tone: 'warning',
  },
  {
    accuracy: 67,
    averageSeconds: 14.6,
    attempts: 18,
    confidence: 'Medium',
    key: 'deflection',
    label: 'Deflection',
    relativePace: '1.4s slower than your median',
    tone: 'neutral',
  },
  {
    accuracy: 72,
    averageSeconds: 12.8,
    attempts: 13,
    confidence: 'Medium',
    key: 'discovered_attack',
    label: 'Discovered attack',
    relativePace: 'Near your median',
    tone: 'neutral',
  },
] as const;

const INITIAL_THEMES: ThemeKey[] = ['fork', 'pin'];

type PrototypeState = {
  pinned: boolean;
  saved: boolean;
  selectedThemes: ThemeKey[];
};

export function PersonalizedTrainingPrototype({
  variant,
}: {
  variant: PersonalizedTrainingVariant;
}): React.JSX.Element {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [state, setState] = useState<PrototypeState>({
    pinned: false,
    saved: false,
    selectedThemes: INITIAL_THEMES,
  });

  const selectedSignals = useMemo(
    () =>
      THEME_SIGNALS.filter(signal => state.selectedThemes.includes(signal.key)),
    [state.selectedThemes],
  );

  const toggleTheme = (theme: ThemeKey) => {
    setState(current => {
      const selected = current.selectedThemes.includes(theme);
      if (selected && current.selectedThemes.length === 1) {
        return current;
      }
      return {
        ...current,
        pinned: false,
        saved: false,
        selectedThemes: selected
          ? current.selectedThemes.filter(item => item !== theme)
          : [...current.selectedThemes, theme],
      };
    });
  };

  const save = (pin: boolean) => {
    setState(current => ({ ...current, pinned: pin, saved: true }));
  };

  const selectedThemeLabel = selectedSignals
    .map(signal => signal.label)
    .join(' + ');

  return (
    <AppFrame>
      {variant === 'coach' ? (
        <CoachVariant
          pinned={state.pinned}
          saved={state.saved}
          selectedSignals={selectedSignals}
          selectedThemeLabel={selectedThemeLabel}
          wide={wide}
          onSave={save}
          onToggleTheme={toggleTheme}
        />
      ) : null}
      {variant === 'workbench' ? (
        <WorkbenchVariant
          pinned={state.pinned}
          saved={state.saved}
          selectedSignals={selectedSignals}
          selectedThemeLabel={selectedThemeLabel}
          wide={wide}
          onSave={save}
          onToggleTheme={toggleTheme}
        />
      ) : null}
      {variant === 'home' ? (
        <HomeFirstVariant
          pinned={state.pinned}
          saved={state.saved}
          selectedSignals={selectedSignals}
          selectedThemeLabel={selectedThemeLabel}
          wide={wide}
          onSave={save}
          onToggleTheme={toggleTheme}
        />
      ) : null}
    </AppFrame>
  );
}

type VariantProps = {
  pinned: boolean;
  saved: boolean;
  selectedSignals: ThemeSignal[];
  selectedThemeLabel: string;
  wide: boolean;
  onSave: (pin: boolean) => void;
  onToggleTheme: (theme: ThemeKey) => void;
};

function CoachVariant({
  pinned,
  saved,
  selectedSignals,
  selectedThemeLabel,
  wide,
  onSave,
  onToggleTheme,
}: VariantProps): React.JSX.Element {
  const [step, setStep] = useState<'insight' | 'setup' | 'home'>('insight');

  const moveToHome = () => {
    onSave(true);
    setStep('home');
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.page, wide ? styles.pageWide : null]}
      showsVerticalScrollIndicator={false}
      testID="personalized-coach-variant"
    >
      <PrototypeContext
        title="A — Guided coach"
        summary="One recommended action carries the player from evidence to setup to a pinned home shortcut."
      />
      <StepRail current={step} onSelect={setStep} />

      {step === 'insight' ? (
        <View style={styles.coachHero} testID="coach-insight-step">
          <Text style={styles.coachEyebrow}>YOUR NEXT BEST SESSION</Text>
          <Text style={styles.coachTitle}>
            Repair the tactics that cost you the most time.
          </Text>
          <Text style={styles.coachBody}>
            Forks and Pins are the clearest weakness signal from your last 30
            days. You stay in control of what gets trained.
          </Text>
          <View style={[styles.coachSignalRow, !wide ? styles.stack : null]}>
            {THEME_SIGNALS.slice(0, 2).map(signal => (
              <View key={signal.key} style={styles.coachSignalCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.coachSignalTitle}>{signal.label}</Text>
                  <SignalDot tone={signal.tone} />
                </View>
                <Text style={styles.coachMetric}>
                  {signal.accuracy}% success
                </Text>
                <Text style={styles.coachMetric}>
                  {signal.averageSeconds.toFixed(1)}s average
                </Text>
                <Text style={styles.coachSignalFoot}>
                  {signal.attempts} recent attempts · {signal.confidence}{' '}
                  confidence
                </Text>
              </View>
            ))}
          </View>
          <EvidenceCaution dark />
          <PrimaryAction
            label="Tune recommended sprint"
            testID="coach-open-setup"
            onPress={() => setStep('setup')}
          />
          <Pressable
            accessibilityRole="button"
            style={styles.coachSecondaryAction}
            onPress={() => setStep('setup')}
          >
            <Text style={styles.coachSecondaryText}>
              Review the full tactical profile
            </Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'setup' ? (
        <View style={styles.coachSetup} testID="coach-setup-step">
          <View style={styles.sectionHeading}>
            <Text style={styles.eyebrow}>RECOMMENDED MIX</Text>
            <Text style={styles.heading}>Weakness repair</Text>
            <Text style={styles.bodyCopy}>
              Select two or more themes, then keep the rest of the familiar
              Custom Sprint controls.
            </Text>
          </View>
          <ThemePicker
            selectedSignals={selectedSignals}
            onToggleTheme={onToggleTheme}
          />
          <View style={styles.configList}>
            <ConfigRow
              label="Theme mix"
              value="Even rotation"
              detail={`${selectedSignals.length} selected`}
            />
            <ConfigRow label="Duration" value="5 min" />
            <ConfigRow label="Time per puzzle" value="20 sec" />
            <ConfigRow label="Starting ELO" value="920" />
          </View>
          <PresetSummary
            pinned={pinned}
            saved={saved}
            themeLabel={selectedThemeLabel}
          />
          <View style={[styles.actionRow, !wide ? styles.stack : null]}>
            <SecondaryAction
              label="Save preset"
              onPress={() => onSave(false)}
            />
            <PrimaryAction
              label="Save & pin to Practice"
              testID="coach-save-pin"
              onPress={moveToHome}
            />
          </View>
        </View>
      ) : null}

      {step === 'home' ? (
        <View style={styles.coachHome} testID="coach-home-step">
          <View style={styles.successBanner}>
            <Text style={styles.successTitle}>Ready for the next session</Text>
            <Text style={styles.successCopy}>
              Weakness repair is saved and pinned above the default sprints.
            </Text>
          </View>
          <PracticeHomePreview
            pinned={pinned}
            themeLabel={selectedThemeLabel}
            customizableDefaults
          />
          <SecondaryAction
            label="Edit this preset"
            onPress={() => setStep('setup')}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function WorkbenchVariant({
  pinned,
  saved,
  selectedSignals,
  selectedThemeLabel,
  wide,
  onSave,
  onToggleTheme,
}: VariantProps): React.JSX.Element {
  return (
    <ScrollView
      contentContainerStyle={[
        styles.page,
        styles.workbenchPage,
        wide ? styles.pageWide : null,
      ]}
      showsVerticalScrollIndicator={false}
      testID="personalized-workbench-variant"
    >
      <PrototypeContext
        title="B — Profile workbench"
        summary="Evidence stays visible while the player composes a multi-theme sprint in a persistent side panel."
      />
      <View style={[styles.workbenchHeader, !wide ? styles.stack : null]}>
        <View style={styles.flexOne}>
          <Text style={styles.eyebrow}>TACTICAL PROFILE · LAST 30 DAYS</Text>
          <Text style={styles.heading}>Where your calculation breaks down</Text>
          <Text style={styles.bodyCopy}>
            Accuracy, speed, sample size, and confidence remain separate so the
            recommendation can be challenged.
          </Text>
        </View>
        <View style={styles.profileScore}>
          <Text style={styles.profileScoreValue}>2</Text>
          <Text style={styles.profileScoreLabel}>clear focus themes</Text>
        </View>
      </View>

      <View style={[styles.workbenchColumns, !wide ? styles.stack : null]}>
        <View
          style={[styles.workbenchProfile, !wide ? styles.naturalPanel : null]}
        >
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.themeColumn]}>
              Theme
            </Text>
            <Text style={styles.tableHeaderText}>Success</Text>
            <Text style={styles.tableHeaderText}>Avg time</Text>
          </View>
          {THEME_SIGNALS.map((signal, index) => {
            const selected = selectedSignals.some(
              item => item.key === signal.key,
            );
            return (
              <Pressable
                key={signal.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${signal.label}, ${
                  signal.accuracy
                }% success, ${signal.averageSeconds.toFixed(
                  1,
                )} seconds average`}
                testID={`workbench-theme-${signal.key}`}
                style={[
                  styles.tableRow,
                  index === THEME_SIGNALS.length - 1
                    ? styles.tableRowLast
                    : null,
                  selected ? styles.tableRowSelected : null,
                ]}
                onPress={() => onToggleTheme(signal.key)}
              >
                <View style={[styles.themeColumn, styles.tableThemeCell]}>
                  <CheckBox selected={selected} />
                  <View style={styles.flexOne}>
                    <Text style={styles.tableTheme}>{signal.label}</Text>
                    <Text style={styles.tableMeta}>
                      {signal.attempts} attempts · {signal.confidence}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.tableValue,
                    signal.tone === 'danger' ? styles.dangerText : null,
                  ]}
                >
                  {signal.accuracy}%
                </Text>
                <View style={styles.tableTimeCell}>
                  <Text style={styles.tableValue}>
                    {signal.averageSeconds.toFixed(1)}s
                  </Text>
                  <View style={styles.paceTrack}>
                    <View
                      style={[
                        styles.paceFill,
                        {
                          width: `${Math.min(100, signal.averageSeconds * 4)}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              </Pressable>
            );
          })}
          <EvidenceCaution />
          <View style={styles.profileLegend}>
            <SignalDot tone="danger" />
            <Text style={styles.profileLegendText}>
              Recommendation combines slow pace and low success, with confidence
              based on sample size.
            </Text>
          </View>
        </View>

        <View
          style={[styles.composerPanel, !wide ? styles.naturalPanel : null]}
          testID="workbench-composer"
        >
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.eyebrow}>SPRINT COMPOSER</Text>
              <Text style={styles.composerTitle}>Weakness repair</Text>
            </View>
            <Text style={styles.composerCount}>
              {selectedSignals.length} themes
            </Text>
          </View>
          <View style={styles.selectedThemeList}>
            {selectedSignals.map((signal, index) => (
              <View key={signal.key} style={styles.selectedThemeRow}>
                <Text style={styles.selectedThemeOrder}>{index + 1}</Text>
                <View style={styles.flexOne}>
                  <Text style={styles.listTitle}>{signal.label}</Text>
                  <Text style={styles.smallCopy}>
                    Even share · {signal.attempts} recent attempts
                  </Text>
                </View>
                <Text style={styles.listMeta}>
                  {Math.round(100 / selectedSignals.length)}%
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.compactConfigGrid}>
            <CompactMetric label="Duration" value="5 min" />
            <CompactMetric label="Pace" value="20 sec" />
            <CompactMetric label="Start ELO" value="920" />
            <CompactMetric label="Available" value="184" />
          </View>
          {saved ? (
            <View style={styles.inlineSuccess} testID="workbench-saved-result">
              <Text style={styles.inlineSuccessText}>
                {pinned ? 'Pinned to Practice home' : 'Saved to your presets'}
              </Text>
            </View>
          ) : null}
          <SecondaryAction label="Save preset" onPress={() => onSave(false)} />
          <PrimaryAction
            label="Save & pin"
            testID="workbench-save-pin"
            onPress={() => onSave(true)}
          />
        </View>
      </View>

      <View style={styles.workbenchHomeStrip}>
        <View style={styles.flexOne}>
          <Text style={styles.listTitle}>Practice-home result</Text>
          <Text style={styles.smallCopy}>
            {saved
              ? `${selectedThemeLabel} is ${
                  pinned ? 'pinned' : 'saved but not pinned'
                }.`
              : 'Save the composer to preview its Practice shortcut.'}
          </Text>
        </View>
        <View style={[styles.miniPreset, !saved ? styles.muted : null]}>
          <Text style={styles.miniPresetLabel}>WEAKNESS REPAIR</Text>
          <Text style={styles.miniPresetTitle}>{selectedThemeLabel}</Text>
          <Text style={styles.miniPresetMeta}>5 min · 20s pace</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function HomeFirstVariant({
  pinned,
  saved,
  selectedSignals,
  selectedThemeLabel,
  wide,
  onSave,
  onToggleTheme,
}: VariantProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);

  const addToHome = () => {
    onSave(true);
    setEditing(false);
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.page, wide ? styles.pageWide : null]}
      showsVerticalScrollIndicator={false}
      testID="personalized-home-variant"
    >
      <PrototypeContext
        title="C — Home-first organizer"
        summary="The Practice home is the control center: customize defaults, act on a weakness cue, and place the new sprint in context."
      />
      <View style={styles.homeHeader}>
        <View style={styles.flexOne}>
          <Text style={styles.heading}>Start a Sprint</Text>
          <Text style={styles.bodyCopy}>
            Your defaults and pinned sprints, arranged for quick repeat
            practice.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          style={styles.manageButton}
          testID="home-manage-sprints"
          onPress={() => setEditing(current => !current)}
        >
          <Text style={styles.manageButtonText}>
            {editing ? 'Done' : 'Customize'}
          </Text>
        </Pressable>
      </View>

      {saved ? (
        <PinnedSprintCard
          pinned={pinned}
          themeLabel={selectedThemeLabel}
          editing={editing}
        />
      ) : (
        <View style={styles.homeInsightCard} testID="home-weakness-cue">
          <View style={styles.insightIcon}>
            <Text style={styles.insightIconText}>↗</Text>
          </View>
          <View style={styles.flexOne}>
            <Text style={styles.homeInsightEyebrow}>
              TACTICAL PROFILE UPDATE
            </Text>
            <Text style={styles.homeInsightTitle}>
              Forks and Pins are slowing you down
            </Text>
            <Text style={styles.smallCopy}>
              54–58% success · 17–19s average · high confidence
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Build a sprint from tactical profile weaknesses"
            style={styles.inlineArrowButton}
            testID="home-build-recommendation"
            onPress={() => setEditing(true)}
          >
            <Text style={styles.inlineArrowText}>Build</Text>
          </Pressable>
        </View>
      )}

      {editing && !saved ? (
        <View style={styles.inlineBuilder} testID="home-inline-builder">
          <View style={styles.builderHeader}>
            <View style={styles.flexOne}>
              <Text style={styles.eyebrow}>ADD TO PRACTICE</Text>
              <Text style={styles.composerTitle}>Weakness repair</Text>
            </View>
            <Text style={styles.builderStep}>1 of 1</Text>
          </View>
          <Text style={styles.smallCopy}>
            Choose every theme this home shortcut should rotate through.
          </Text>
          <ThemePicker
            selectedSignals={selectedSignals}
            onToggleTheme={onToggleTheme}
            compact
          />
          <View style={styles.builderSummary}>
            <Text style={styles.listTitle}>{selectedThemeLabel}</Text>
            <Text style={styles.smallCopy}>
              5 min · 20s per puzzle · even rotation
            </Text>
          </View>
          <PrimaryAction
            label="Add & pin to Practice"
            testID="home-add-pin"
            onPress={addToHome}
          />
        </View>
      ) : null}

      <View style={[styles.homeColumns, wide ? styles.homeColumnsWide : null]}>
        <View style={[styles.homeModeList, !wide ? styles.naturalPanel : null]}>
          <Text style={styles.sectionLabel}>Default sprints</Text>
          <EditableModeRow
            title="Standard"
            description="Solve the best move"
            detail="5 min · 20s pace"
            rating="ELO 914"
            editing={editing}
          />
          <EditableModeRow
            title="Arrow Duel"
            description="Choose between candidate moves"
            detail="5 min · 30s pace"
            rating="ELO 882"
            editing={editing}
          />
          <EditableModeRow
            title="Custom"
            description="Create another focused sprint"
            detail="Time, themes, rating"
            editing={editing}
          />
        </View>
        <View
          style={[styles.homeProfilePeek, !wide ? styles.naturalPanel : null]}
        >
          <View style={styles.rowBetween}>
            <Text style={styles.sectionLabel}>Tactical profile</Text>
            <Text style={styles.textLink}>View all</Text>
          </View>
          {THEME_SIGNALS.slice(0, 3).map(signal => (
            <View key={signal.key} style={styles.profilePeekRow}>
              <SignalDot tone={signal.tone} />
              <Text style={[styles.listTitle, styles.flexOne]}>
                {signal.label}
              </Text>
              <Text style={styles.listMeta}>
                {signal.accuracy}% · {signal.averageSeconds.toFixed(1)}s
              </Text>
            </View>
          ))}
          <EvidenceCaution />
        </View>
      </View>
    </ScrollView>
  );
}

function AppFrame({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.app}>
      <View style={styles.appHeader}>
        <View>
          <Text style={styles.appTitle}>Practice</Text>
          <Text style={styles.appSubtitle}>
            Personalized training design slice
          </Text>
        </View>
        <View style={styles.designBadge}>
          <Text style={styles.designBadgeText}>LAB ONLY</Text>
        </View>
      </View>
      <View style={styles.content}>{children}</View>
      <View style={styles.bottomTabs} accessibilityRole="tablist">
        <FakeTab label="Practice" glyph="◎" active />
        <FakeTab label="Review" glyph="◇" />
        <FakeTab label="History" glyph="◷" />
        <FakeTab label="Settings" glyph="≡" />
      </View>
    </View>
  );
}

function FakeTab({
  active = false,
  glyph,
  label,
}: {
  active?: boolean;
  glyph: string;
  label: string;
}): React.JSX.Element {
  return (
    <View
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={styles.fakeTab}
    >
      <Text style={[styles.fakeTabGlyph, active ? styles.fakeTabActive : null]}>
        {glyph}
      </Text>
      <Text style={[styles.fakeTabText, active ? styles.fakeTabActive : null]}>
        {label}
      </Text>
    </View>
  );
}

function PrototypeContext({
  title,
  summary,
}: {
  title: string;
  summary: string;
}): React.JSX.Element {
  return (
    <View style={styles.prototypeContext} testID="prototype-context">
      <View style={styles.prototypeContextBadge}>
        <Text style={styles.prototypeContextBadgeText}>STRUCTURAL VARIANT</Text>
      </View>
      <Text style={styles.prototypeContextTitle}>{title}</Text>
      <Text style={styles.prototypeContextCopy}>{summary}</Text>
    </View>
  );
}

function StepRail({
  current,
  onSelect,
}: {
  current: 'insight' | 'setup' | 'home';
  onSelect: (step: 'insight' | 'setup' | 'home') => void;
}): React.JSX.Element {
  const steps = [
    { key: 'insight', label: 'Insight' },
    { key: 'setup', label: 'Configure' },
    { key: 'home', label: 'Practice home' },
  ] as const;
  return (
    <View style={styles.stepRail} accessibilityRole="tablist">
      {steps.map((step, index) => {
        const active = step.key === current;
        return (
          <React.Fragment key={step.key}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={styles.stepButton}
              onPress={() => onSelect(step.key)}
            >
              <View
                style={[
                  styles.stepNumber,
                  active ? styles.stepNumberActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.stepNumberText,
                    active ? styles.stepNumberTextActive : null,
                  ]}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  active ? styles.stepLabelActive : null,
                ]}
              >
                {step.label}
              </Text>
            </Pressable>
            {index < steps.length - 1 ? <View style={styles.stepLine} /> : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function ThemePicker({
  compact = false,
  selectedSignals,
  onToggleTheme,
}: {
  compact?: boolean;
  selectedSignals: ThemeSignal[];
  onToggleTheme: (theme: ThemeKey) => void;
}): React.JSX.Element {
  return (
    <View
      style={[styles.themePicker, compact ? styles.themePickerCompact : null]}
      testID="multi-theme-picker"
    >
      {THEME_SIGNALS.map(signal => {
        const selected = selectedSignals.some(item => item.key === signal.key);
        return (
          <Pressable
            key={signal.key}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${signal.label} theme, ${
              selected ? 'selected' : 'not selected'
            }`}
            testID={`prototype-theme-${signal.key}`}
            style={[styles.themeChip, selected ? styles.themeChipActive : null]}
            onPress={() => onToggleTheme(signal.key)}
          >
            <CheckBox selected={selected} />
            <View>
              <Text
                style={[
                  styles.themeChipTitle,
                  selected ? styles.themeChipTitleActive : null,
                ]}
              >
                {signal.label}
              </Text>
              {!compact ? (
                <Text style={styles.themeChipMeta}>
                  {signal.accuracy}% · {signal.averageSeconds.toFixed(1)}s
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function CheckBox({ selected }: { selected: boolean }): React.JSX.Element {
  return (
    <View style={[styles.checkbox, selected ? styles.checkboxActive : null]}>
      {selected ? <Text style={styles.checkboxMark}>✓</Text> : null}
    </View>
  );
}

function ConfigRow({
  label,
  value,
  detail,
}: {
  detail?: string;
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.configRow}>
      <Text style={styles.listTitle}>{label}</Text>
      <View style={styles.configValueBlock}>
        <Text style={styles.configValue}>{value}</Text>
        {detail ? <Text style={styles.smallCopy}>{detail}</Text> : null}
      </View>
    </View>
  );
}

function PresetSummary({
  pinned,
  saved,
  themeLabel,
}: {
  pinned: boolean;
  saved: boolean;
  themeLabel: string;
}): React.JSX.Element {
  return (
    <View style={styles.presetSummary}>
      <View style={styles.presetIcon}>
        <Text style={styles.presetIconText}>◎</Text>
      </View>
      <View style={styles.flexOne}>
        <Text style={styles.listTitle}>Weakness repair</Text>
        <Text style={styles.smallCopy}>{themeLabel} · 5 min · 20s pace</Text>
      </View>
      <Text style={styles.presetState}>
        {pinned ? 'PINNED' : saved ? 'SAVED' : 'PREVIEW'}
      </Text>
    </View>
  );
}

function PracticeHomePreview({
  customizableDefaults,
  pinned,
  themeLabel,
}: {
  customizableDefaults: boolean;
  pinned: boolean;
  themeLabel: string;
}): React.JSX.Element {
  return (
    <View style={styles.practicePreview}>
      <View style={styles.rowBetween}>
        <Text style={styles.heading}>Start a Sprint</Text>
        {customizableDefaults ? (
          <Text style={styles.textLink}>Customize</Text>
        ) : null}
      </View>
      <PinnedSprintCard
        pinned={pinned}
        themeLabel={themeLabel}
        editing={false}
      />
      <EditableModeRow
        title="Standard"
        description="Solve the best move"
        detail="5 min · 20s pace"
        rating="ELO 914"
        editing={false}
      />
      <EditableModeRow
        title="Arrow Duel"
        description="Choose between candidate moves"
        detail="5 min · 30s pace"
        rating="ELO 882"
        editing={false}
      />
    </View>
  );
}

function PinnedSprintCard({
  editing,
  pinned,
  themeLabel,
}: {
  editing: boolean;
  pinned: boolean;
  themeLabel: string;
}): React.JSX.Element {
  return (
    <View style={styles.pinnedCard} testID="pinned-personalized-sprint">
      <View style={styles.pinnedAccent} />
      <View style={styles.pinnedCopy}>
        <View style={styles.pinnedTitleRow}>
          <Text style={styles.pinnedBadge}>{pinned ? 'PINNED' : 'SAVED'}</Text>
          <Text style={styles.pinnedTitle}>Weakness repair</Text>
        </View>
        <Text style={styles.pinnedThemes}>{themeLabel}</Text>
        <Text style={styles.smallCopy}>5 min · 20s pace · ELO 920</Text>
      </View>
      {editing ? (
        <View style={styles.editHandle}>
          <Text style={styles.editHandleText}>≡</Text>
        </View>
      ) : (
        <View style={styles.startCircle}>
          <Text style={styles.startCircleText}>▶</Text>
        </View>
      )}
    </View>
  );
}

function EditableModeRow({
  description,
  detail,
  editing,
  rating,
  title,
}: {
  description: string;
  detail: string;
  editing: boolean;
  rating?: string;
  title: string;
}): React.JSX.Element {
  return (
    <View style={styles.modeRow}>
      <View style={styles.modeIcon}>
        <Text style={styles.modeIconText}>
          {title === 'Arrow Duel' ? '↗' : title === 'Custom' ? '≡' : '◎'}
        </Text>
      </View>
      <View style={styles.flexOne}>
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.smallCopy} numberOfLines={1}>
          {description}
        </Text>
        <Text style={styles.modeDetail}>{detail}</Text>
      </View>
      {editing ? (
        <Text style={styles.textLink}>Edit</Text>
      ) : rating ? (
        <Text style={styles.listMeta}>{rating}</Text>
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </View>
  );
}

function EvidenceCaution({
  dark = false,
}: {
  dark?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.caution, dark ? styles.cautionDark : null]}>
      <Text style={[styles.cautionMark, dark ? styles.cautionMarkDark : null]}>
        i
      </Text>
      <Text style={[styles.cautionText, dark ? styles.cautionTextDark : null]}>
        Prototype assumption: speed and success both contribute. The player
        confirms the targets; the signal never starts training automatically.
      </Text>
    </View>
  );
}

function CompactMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.compactMetric}>
      <Text style={styles.compactMetricLabel}>{label}</Text>
      <Text style={styles.compactMetricValue}>{value}</Text>
    </View>
  );
}

function SignalDot({ tone }: { tone: ThemeSignal['tone'] }): React.JSX.Element {
  return (
    <View
      style={[
        styles.signalDot,
        tone === 'danger'
          ? styles.signalDanger
          : tone === 'warning'
          ? styles.signalWarning
          : styles.signalNeutral,
      ]}
    />
  );
}

function PrimaryAction({
  label,
  testID,
  onPress,
}: {
  label: string;
  testID?: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      style={styles.primaryButton}
      onPress={onPress}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      style={styles.secondaryButton}
      onPress={onPress}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  app: {
    backgroundColor: '#F8FAFC',
    flex: 1,
    minHeight: 0,
  },
  appHeader: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E2E8F0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  appTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },
  appSubtitle: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  designBadge: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  designBadgeText: {
    color: '#92400E',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  page: {
    gap: 14,
    paddingBottom: 116,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  pageWide: {
    alignSelf: 'center',
    maxWidth: 1120,
    paddingHorizontal: 24,
    width: '100%',
  },
  bottomTabs: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E2E8F0',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    height: 62,
    left: 0,
    paddingHorizontal: 8,
    position: 'absolute',
    right: 0,
  },
  fakeTab: {
    alignItems: 'center',
    flex: 1,
    gap: 1,
    justifyContent: 'center',
  },
  fakeTabGlyph: {
    color: '#64748B',
    fontSize: 17,
    fontWeight: '800',
  },
  fakeTabText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  fakeTabActive: {
    color: '#2563EB',
  },
  prototypeContext: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  prototypeContextBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  prototypeContextBadgeText: {
    color: '#1D4ED8',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  prototypeContextTitle: {
    color: '#1E3A8A',
    fontSize: 13,
    fontWeight: '900',
  },
  prototypeContextCopy: {
    color: '#475569',
    fontSize: 11,
    lineHeight: 16,
  },
  flexOne: { flex: 1 },
  naturalPanel: {
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
  },
  stack: {
    flexDirection: 'column',
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  heading: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  bodyCopy: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 19,
  },
  smallCopy: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 16,
  },
  listTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  listMeta: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
  },
  sectionLabel: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
  },
  textLink: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '900',
  },
  chevron: {
    color: '#64748B',
    fontSize: 22,
    fontWeight: '700',
  },
  stepRail: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  stepButton: {
    alignItems: 'center',
    gap: 4,
  },
  stepNumber: {
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  stepNumberActive: { backgroundColor: '#2563EB' },
  stepNumberText: { color: '#475569', fontSize: 10, fontWeight: '900' },
  stepNumberTextActive: { color: '#FFFFFF' },
  stepLabel: { color: '#64748B', fontSize: 9, fontWeight: '800' },
  stepLabelActive: { color: '#1D4ED8' },
  stepLine: {
    backgroundColor: '#CBD5E1',
    flex: 1,
    height: 1,
    marginHorizontal: 7,
    marginTop: -14,
  },
  coachHero: {
    backgroundColor: '#172554',
    borderRadius: 12,
    gap: 14,
    overflow: 'hidden',
    padding: 18,
  },
  coachEyebrow: {
    color: '#93C5FD',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  coachTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.7,
    lineHeight: 32,
  },
  coachBody: { color: '#CBD5E1', fontSize: 13, lineHeight: 20 },
  coachSignalRow: { flexDirection: 'row', gap: 10 },
  coachSignalCard: {
    backgroundColor: '#1E3A8A',
    borderColor: '#3B82F6',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minWidth: 0,
    padding: 11,
  },
  coachSignalTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  coachMetric: { color: '#DBEAFE', fontSize: 12, fontWeight: '800' },
  coachSignalFoot: {
    color: '#93C5FD',
    fontSize: 9,
    lineHeight: 13,
    marginTop: 4,
  },
  coachSecondaryAction: { alignItems: 'center', paddingVertical: 4 },
  coachSecondaryText: { color: '#BFDBFE', fontSize: 12, fontWeight: '800' },
  coachSetup: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 10,
    borderWidth: 1,
    gap: 14,
    padding: 14,
  },
  coachHome: { gap: 12 },
  sectionHeading: { gap: 4 },
  themePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themePickerCompact: { gap: 6 },
  themeChip: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  themeChipActive: { backgroundColor: '#EFF6FF', borderColor: '#2563EB' },
  themeChipTitle: { color: '#334155', fontSize: 12, fontWeight: '800' },
  themeChipTitleActive: { color: '#1D4ED8' },
  themeChipMeta: { color: '#64748B', fontSize: 9, marginTop: 1 },
  checkbox: {
    alignItems: 'center',
    borderColor: '#94A3B8',
    borderRadius: 4,
    borderWidth: 1,
    height: 17,
    justifyContent: 'center',
    width: 17,
  },
  checkboxActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 13,
  },
  configList: {
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  configRow: {
    alignItems: 'center',
    borderBottomColor: '#E2E8F0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  configValueBlock: { alignItems: 'flex-end' },
  configValue: { color: '#111827', fontSize: 13, fontWeight: '900' },
  presetSummary: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 11,
  },
  presetIcon: {
    alignItems: 'center',
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  presetIconText: { color: '#2563EB', fontSize: 18, fontWeight: '900' },
  presetState: {
    color: '#2563EB',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  actionRow: { flexDirection: 'row', gap: 8 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  secondaryButtonText: { color: '#334155', fontSize: 13, fontWeight: '800' },
  successBanner: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    padding: 11,
  },
  successTitle: { color: '#065F46', fontSize: 13, fontWeight: '900' },
  successCopy: { color: '#047857', fontSize: 11, lineHeight: 16 },
  practicePreview: { gap: 8 },
  caution: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 7,
    paddingVertical: 4,
  },
  cautionDark: { backgroundColor: '#1E3A8A', borderRadius: 7, padding: 9 },
  cautionMark: { color: '#2563EB', fontSize: 11, fontWeight: '900' },
  cautionMarkDark: { color: '#93C5FD' },
  cautionText: { color: '#64748B', flex: 1, fontSize: 10, lineHeight: 15 },
  cautionTextDark: { color: '#BFDBFE' },
  workbenchPage: { backgroundColor: '#F1F5F9' },
  workbenchHeader: { alignItems: 'flex-end', flexDirection: 'row', gap: 16 },
  profileScore: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 100,
    padding: 10,
  },
  profileScoreValue: { color: '#DC2626', fontSize: 28, fontWeight: '900' },
  profileScoreLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
  },
  workbenchColumns: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  workbenchProfile: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 9,
    borderWidth: 1,
    flex: 1.45,
    overflow: 'hidden',
    width: '100%',
  },
  tableHeader: {
    backgroundColor: '#F8FAFC',
    borderBottomColor: '#E2E8F0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tableHeaderText: {
    color: '#64748B',
    flex: 0.65,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  themeColumn: { flex: 1.4 },
  tableRow: {
    alignItems: 'center',
    borderBottomColor: '#E2E8F0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 62,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tableRowLast: { borderBottomWidth: 0 },
  tableRowSelected: { backgroundColor: '#EFF6FF' },
  tableThemeCell: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  tableTheme: { color: '#111827', fontSize: 12, fontWeight: '900' },
  tableMeta: { color: '#64748B', fontSize: 9, marginTop: 2 },
  tableValue: { color: '#334155', flex: 0.65, fontSize: 12, fontWeight: '900' },
  dangerText: { color: '#DC2626' },
  tableTimeCell: { flex: 0.65, gap: 4 },
  paceTrack: {
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    height: 3,
    overflow: 'hidden',
    width: '100%',
  },
  paceFill: { backgroundColor: '#F59E0B', borderRadius: 999, height: 3 },
  profileLegend: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderTopColor: '#E2E8F0',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 7,
    padding: 10,
  },
  profileLegendText: { color: '#64748B', flex: 1, fontSize: 9, lineHeight: 13 },
  composerPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 9,
    borderWidth: 1,
    flex: 0.85,
    gap: 10,
    minWidth: 278,
    padding: 12,
    width: '100%',
  },
  composerTitle: { color: '#111827', fontSize: 18, fontWeight: '900' },
  composerCount: {
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    color: '#1D4ED8',
    fontSize: 9,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  selectedThemeList: {
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  selectedThemeRow: {
    alignItems: 'center',
    borderBottomColor: '#E2E8F0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  selectedThemeOrder: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 999,
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  compactConfigGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  compactMetric: {
    backgroundColor: '#F8FAFC',
    borderRadius: 7,
    flexBasis: '46%',
    flexGrow: 1,
    gap: 2,
    padding: 8,
  },
  compactMetricLabel: { color: '#64748B', fontSize: 9, fontWeight: '800' },
  compactMetricValue: { color: '#111827', fontSize: 13, fontWeight: '900' },
  inlineSuccess: { backgroundColor: '#ECFDF5', borderRadius: 7, padding: 8 },
  inlineSuccessText: {
    color: '#047857',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  workbenchHomeStrip: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  miniPreset: {
    backgroundColor: '#172554',
    borderRadius: 8,
    gap: 1,
    minWidth: 180,
    padding: 10,
  },
  miniPresetLabel: {
    color: '#93C5FD',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  miniPresetTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  miniPresetMeta: { color: '#BFDBFE', fontSize: 9 },
  muted: { opacity: 0.42 },
  signalDot: { borderRadius: 999, height: 8, width: 8 },
  signalDanger: { backgroundColor: '#DC2626' },
  signalWarning: { backgroundColor: '#F59E0B' },
  signalNeutral: { backgroundColor: '#64748B' },
  homeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  manageButton: {
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  manageButtonText: { color: '#2563EB', fontSize: 11, fontWeight: '900' },
  homeInsightCard: {
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 11,
  },
  insightIcon: {
    alignItems: 'center',
    backgroundColor: '#FFEDD5',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  insightIconText: { color: '#C2410C', fontSize: 18, fontWeight: '900' },
  homeInsightEyebrow: {
    color: '#C2410C',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  homeInsightTitle: {
    color: '#7C2D12',
    fontSize: 13,
    fontWeight: '900',
    marginVertical: 2,
  },
  inlineArrowButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#FDBA74',
    borderRadius: 7,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 10,
  },
  inlineArrowText: { color: '#C2410C', fontSize: 10, fontWeight: '900' },
  inlineBuilder: {
    backgroundColor: '#FFFFFF',
    borderColor: '#93C5FD',
    borderRadius: 10,
    borderWidth: 2,
    gap: 11,
    padding: 12,
  },
  builderHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  builderStep: { color: '#64748B', fontSize: 10, fontWeight: '800' },
  builderSummary: {
    backgroundColor: '#F8FAFC',
    borderRadius: 7,
    gap: 2,
    padding: 9,
  },
  homeColumns: { gap: 14 },
  homeColumnsWide: { alignItems: 'flex-start', flexDirection: 'row' },
  homeModeList: { flex: 1.2, gap: 8, width: '100%' },
  homeProfilePeek: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 9,
    borderWidth: 1,
    flex: 0.8,
    gap: 8,
    padding: 11,
    width: '100%',
  },
  profilePeekRow: {
    alignItems: 'center',
    borderTopColor: '#F1F5F9',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingTop: 8,
  },
  pinnedCard: {
    alignItems: 'center',
    backgroundColor: '#172554',
    borderRadius: 9,
    flexDirection: 'row',
    gap: 10,
    minHeight: 78,
    overflow: 'hidden',
    padding: 11,
  },
  pinnedAccent: {
    alignSelf: 'stretch',
    backgroundColor: '#60A5FA',
    borderRadius: 999,
    width: 4,
  },
  pinnedCopy: { flex: 1, gap: 2 },
  pinnedTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pinnedBadge: {
    backgroundColor: '#1E40AF',
    borderRadius: 999,
    color: '#BFDBFE',
    fontSize: 8,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  pinnedTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  pinnedThemes: { color: '#DBEAFE', fontSize: 12, fontWeight: '800' },
  startCircle: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  startCircleText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 2,
  },
  editHandle: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  editHandleText: { color: '#BFDBFE', fontSize: 20, fontWeight: '900' },
  modeRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 68,
    padding: 9,
  },
  modeIcon: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  modeIconText: { color: '#2563EB', fontSize: 16, fontWeight: '900' },
  modeDetail: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
  },
});
