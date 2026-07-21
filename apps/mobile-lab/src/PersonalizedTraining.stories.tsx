import React, { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import {
  PERSONALIZED_TRAINING_VARIANT_LABELS,
  PERSONALIZED_TRAINING_VARIANTS,
  PersonalizedTrainingPrototype,
  type PersonalizedTrainingVariant
} from "../../mobile/src/components/PersonalizedTrainingPrototype.tsx";
import { LabScenarioShell } from "./LabScenario.tsx";
import { PrototypeVariantSwitcher } from "./PrototypeVariantSwitcher.tsx";

const SCENARIO_ID = "practice-personalized-training-prototype" as const;

const variantOptions = PERSONALIZED_TRAINING_VARIANTS.map((key) => ({
  key,
  label: PERSONALIZED_TRAINING_VARIANT_LABELS[key]
}));

function PersonalizedTrainingLab(): React.JSX.Element {
  const [variant, setVariant] = useState<PersonalizedTrainingVariant>(() => variantFromUrl());

  useEffect(() => {
    const syncFromUrl = () => setVariant(variantFromUrl());
    globalThis.addEventListener("popstate", syncFromUrl);
    return () => globalThis.removeEventListener("popstate", syncFromUrl);
  }, []);

  const selectVariant = (next: PersonalizedTrainingVariant) => {
    const url = new URL(globalThis.location.href);
    url.searchParams.set("variant", next);
    globalThis.history.replaceState({}, "", url);
    setVariant(next);
  };

  return (
    <LabScenarioShell scenarioId={SCENARIO_ID}>
      <div className="prototype-lab-stage">
        <PersonalizedTrainingPrototype key={variant} variant={variant} />
        <PrototypeVariantSwitcher
          current={variant}
          options={variantOptions}
          onChange={selectVariant}
        />
      </div>
    </LabScenarioShell>
  );
}

function variantFromUrl(): PersonalizedTrainingVariant {
  const requested = new URL(globalThis.location.href).searchParams.get("variant");
  return PERSONALIZED_TRAINING_VARIANTS.find((variant) => variant === requested) ?? "coach";
}

const meta = {
  title: "Practice/Personalized Training",
  component: PersonalizedTrainingLab,
  tags: ["new"]
} satisfies Meta<typeof PersonalizedTrainingLab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Prototype: Story = {
  name: "Prototype"
};
