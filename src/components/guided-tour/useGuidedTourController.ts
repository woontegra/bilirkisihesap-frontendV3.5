import { useCallback, useState } from "react";

export function useGuidedTourController() {
  const [active, setActive] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [resumeStepIndex, setResumeStepIndex] = useState(0);

  const openTour = useCallback((stepIndex = 0) => {
    setWelcomeOpen(false);
    setResumeStepIndex(stepIndex);
    setActive(true);
  }, []);

  const openWelcome = useCallback(() => setWelcomeOpen(true), []);

  const completeTour = useCallback(() => {
    setActive(false);
  }, []);

  return {
    active,
    setActive,
    welcomeOpen,
    setWelcomeOpen,
    resumeStepIndex,
    openTour,
    openWelcome,
    completeTour,
  };
}
