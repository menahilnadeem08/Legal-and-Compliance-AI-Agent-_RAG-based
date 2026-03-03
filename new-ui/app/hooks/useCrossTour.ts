import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface TourState {
  isActive: boolean;
  pageId: string;
  currentStepIndex: number;
  totalSteps: number;
  lastRoute: string;
}

const CROSS_TOUR_STORAGE_KEY = 'legal-rag-cross-tour-state';

export const useCrossTour = (pageId: string, totalSteps: number) => {
  const pathname = usePathname();
  const [tourState, setTourState] = useState<TourState | null>(null);

  // Load tour state from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = localStorage.getItem(CROSS_TOUR_STORAGE_KEY);
    if (stored) {
      try {
        const state = JSON.parse(stored) as TourState;
        setTourState((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(state)) return prev;
          return state;
        });
      } catch (e) {
        console.error('Failed to parse tour state:', e);
      }
    }
  }, []);

  // Check if tour should resume on this page
  const shouldResumeTour = useCallback((): { resume: boolean; stepIndex: number } => {
    if (!tourState || !tourState.isActive) {
      return { resume: false, stepIndex: 0 };
    }

    // If we're on a different page (route) than where the tour was active
    if (tourState.lastRoute !== pathname) {
      return { resume: true, stepIndex: 0 };
    }

    return { resume: true, stepIndex: tourState.currentStepIndex };
  }, [tourState, pathname]);

  // Update tour state when stepping
  const updateTourState = useCallback((stepIndex: number, isActive: boolean) => {
    const newState: TourState = {
      isActive,
      pageId,
      currentStepIndex: stepIndex,
      totalSteps,
      lastRoute: pathname,
    };

    setTourState(newState);

    if (typeof window !== 'undefined') {
      if (isActive) {
        localStorage.setItem(CROSS_TOUR_STORAGE_KEY, JSON.stringify(newState));
      } else {
        localStorage.removeItem(CROSS_TOUR_STORAGE_KEY);
      }
    }
  }, [pageId, totalSteps, pathname]);

  // Save state for cross-page navigation (target page will resume tour from step 0)
  const updateTourStateForNavigation = useCallback((targetPageId: string, targetRoute: string) => {
    const newState: TourState = {
      isActive: true,
      pageId: targetPageId,
      currentStepIndex: 0,
      totalSteps: 0, // Will be set by target page
      lastRoute: targetRoute,
    };

    setTourState(newState);

    if (typeof window !== 'undefined') {
      localStorage.setItem(CROSS_TOUR_STORAGE_KEY, JSON.stringify(newState));
    }
  }, []);

  // Clear tour state
  const clearTourState = useCallback(() => {
    setTourState(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CROSS_TOUR_STORAGE_KEY);
    }
  }, []);

  return {
    shouldResumeTour,
    updateTourState,
    updateTourStateForNavigation,
    clearTourState,
    tourState,
  };
};
