export type PluralMessage = {
  readonly one?: string;
  readonly other: string;
};

export type MessageValue = string | PluralMessage;

export type ExtractPlaceholders<S extends string> =
  S extends `${string}{{${infer Param}}}${infer Rest}`
    ? Param | ExtractPlaceholders<Rest>
    : never;

export type ExtractMessagePlaceholders<V extends MessageValue> =
  V extends string
    ? ExtractPlaceholders<V>
    : V extends PluralMessage
      ? ExtractPlaceholders<V["other"]> | (V["one"] extends string ? ExtractPlaceholders<V["one"]> : never)
      : never;

export type InterpolationValues<V extends MessageValue> =
  V extends PluralMessage
    ? { count: number } & Record<Exclude<ExtractMessagePlaceholders<V>, "count">, string | number>
    : [ExtractMessagePlaceholders<V>] extends [never]
      ? never
      : Record<ExtractMessagePlaceholders<V>, string | number>;

export type TranslateArgs<V extends MessageValue> =
  [InterpolationValues<V>] extends [never]
    ? []
    : [params: InterpolationValues<V>];
