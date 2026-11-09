// One column of a result screen's stats card (ResultScreenLayout), shared by
// the Sprint Result and Survival result presentations.
export type ResultStat = {
  key: string;
  label: string;
  value: string;
  valueTone: "primary" | "positive" | "negative";
  detail?: string;
  /** A word rather than a number (Unrated), drawn smaller so it fits one line. */
  valueIsWord?: boolean;
  accessibilityLabel: string;
};
