const ALL_HISTORY_ATTENTION_REASONS: readonly HistoryAttentionReason[] = [
  "unclear",
  "in_review",
  "incomplete"
];

  const [historyTimeRange, setHistoryTimeRange] = useState<HistoryTimeRange>("7d");
  const [historySourceFilter, setHistorySourceFilter] = useState<"all" | AttemptSource>("sprint");
  const historyAttentionReasonOptions = ALL_HISTORY_ATTENTION_REASONS;
  const [historyResultFilter, setHistoryResultFilter] = useState<HistoryResultFilter>("all");
  const [historySideFilter, setHistorySideFilter] = useState<"all" | PuzzleSide>("all");
  const [historyRatingRangeFilter, setHistoryRatingRangeFilter] = useState<HistoryRatingRangeFilter>("all");
  const [historyAttentionReasons, setHistoryAttentionReasons] = useState<HistoryAttentionReason[]>(
    () => [...historyAttentionReasonOptions]
  );
  const [historyPageOffset, setHistoryPageOffset] = useState(0);
  const [historyRatingKey, setHistoryRatingKey] = useState<string | null>(null);

  const [historyProgressOpen, setHistoryProgressOpen] = useState(false);

  const [historyFiltersExpanded, setHistoryFiltersExpanded] = useState(false);

  const historyThemeChoices = useThemeChoiceSelection();
