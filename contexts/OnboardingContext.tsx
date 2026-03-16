import React, { createContext, useContext, useState } from "react";

interface OnboardingAnswers {
  collectorLevel: string | null;
  wineStyles: string[];
  regions: string[];
  occasions: string[];
  additionalNotes: string;
}

interface OnboardingContextType {
  answers: OnboardingAnswers;
  setCollectorLevel: (val: string) => void;
  toggleWineStyle: (val: string) => void;
  toggleRegion: (val: string) => void;
  toggleOccasion: (val: string) => void;
  setAdditionalNotes: (val: string) => void;
}

const defaultAnswers: OnboardingAnswers = {
  collectorLevel: null,
  wineStyles: [],
  regions: [],
  occasions: [],
  additionalNotes: "",
};

const OnboardingContext = createContext<OnboardingContextType>({
  answers: defaultAnswers,
  setCollectorLevel: () => {},
  toggleWineStyle: () => {},
  toggleRegion: () => {},
  toggleOccasion: () => {},
  setAdditionalNotes: () => {},
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [answers, setAnswers] = useState<OnboardingAnswers>(defaultAnswers);

  const setCollectorLevel = (val: string) =>
    setAnswers((prev) => ({ ...prev, collectorLevel: val }));

  const toggleWineStyle = (val: string) =>
    setAnswers((prev) => {
      if (val === "everything") {
        return { ...prev, wineStyles: prev.wineStyles.includes("everything") ? [] : ["everything"] };
      }
      const filtered = prev.wineStyles.filter((s) => s !== "everything");
      return {
        ...prev,
        wineStyles: filtered.includes(val) ? filtered.filter((s) => s !== val) : [...filtered, val],
      };
    });

  const toggleRegion = (val: string) =>
    setAnswers((prev) => {
      if (val === "anything") {
        return { ...prev, regions: prev.regions.includes("anything") ? [] : ["anything"] };
      }
      const filtered = prev.regions.filter((r) => r !== "anything");
      return {
        ...prev,
        regions: filtered.includes(val) ? filtered.filter((r) => r !== val) : [...filtered, val],
      };
    });

  const toggleOccasion = (val: string) =>
    setAnswers((prev) => ({
      ...prev,
      occasions: prev.occasions.includes(val)
        ? prev.occasions.filter((o) => o !== val)
        : [...prev.occasions, val],
    }));

  const setAdditionalNotes = (val: string) =>
    setAnswers((prev) => ({ ...prev, additionalNotes: val }));

  return (
    <OnboardingContext.Provider
      value={{ answers, setCollectorLevel, toggleWineStyle, toggleRegion, toggleOccasion, setAdditionalNotes }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export const useOnboarding = () => useContext(OnboardingContext);
