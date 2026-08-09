export type ArrowDuelDifficulty = 0 | 1 | 2 | 3 | 4;

export const ALL_ARROW_DUEL_DIFFICULTIES: readonly ArrowDuelDifficulty[] = [
  0,
  1,
  2,
  3,
  4
];

export function normalizeArrowDuelDifficulties(
  values?: readonly number[]
): ArrowDuelDifficulty[] {
  if (values === undefined) {
    return [...ALL_ARROW_DUEL_DIFFICULTIES];
  }
  const normalized = [...new Set(values)].sort((left, right) => left - right);
  if (!normalized.every(isArrowDuelDifficulty)) {
    throw new Error("Arrow Duel difficulties must be whole numbers from 0 through 4");
  }
  if (normalized.length === 0) {
    throw new Error("Select at least one Arrow Duel difficulty");
  }
  return normalized;
}

export function restrictedArrowDuelDifficulties(
  values?: readonly number[]
): ArrowDuelDifficulty[] | undefined {
  const normalized = normalizeArrowDuelDifficulties(values);
  return normalized.length === ALL_ARROW_DUEL_DIFFICULTIES.length
    ? undefined
    : normalized;
}

export function toggleArrowDuelDifficulty(
  selected: readonly number[],
  difficulty: ArrowDuelDifficulty
): ArrowDuelDifficulty[] {
  const normalized = normalizeArrowDuelDifficulties(selected);
  if (!normalized.includes(difficulty)) {
    return normalizeArrowDuelDifficulties([...normalized, difficulty]);
  }
  return normalized.length === 1
    ? normalized
    : normalized.filter((value) => value !== difficulty);
}

export function arrowDuelDifficultyLabel(difficulty: ArrowDuelDifficulty): string {
  return difficulty === 4 ? "4+" : String(difficulty);
}

export function isArrowDuelDifficulty(value: number): value is ArrowDuelDifficulty {
  return Number.isInteger(value) && value >= 0 && value <= 4;
}
