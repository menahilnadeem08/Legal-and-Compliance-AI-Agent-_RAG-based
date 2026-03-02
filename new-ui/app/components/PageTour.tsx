"use client";

import React, { useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useCrossTour } from "@/app/hooks/useCrossTour";

export interface PageTourRef {
  startTour: () => void;
}

export interface PageTourStep extends DriveStep {
  /** Optional route this step belongs to. If not provided, applies to all routes. */
  route?: string;
  /**
   * When to auto-advance: 'click' = on any click (default), 'change' = on change/select (e.g. dropdown),
   * 'manual' = never auto-advance, user must click Next.
   */
  autoAdvanceOn?: "click" | "change" | "manual";
}

export interface PageTourProps {
  /** Unique page identifier for localStorage (e.g. "chat", "upload") */
  pageId: string;
  /** Tour steps for this page */
  steps: PageTourStep[];
  /** Auto-run on first visit. Default true. */
  runOnMount?: boolean;
  /** Auto-advance to next step when target element is clicked. Default false. */
  autoAdvanceOnTargetClick?: boolean;
}

const STORAGE_PREFIX = "legal-rag-tour-";
const CROSS_TOUR_STORAGE_KEY = "legal-rag-cross-tour-state";

/** Route to pageId mapping for cross-page navigation */
function routeToPageId(route: string): string {
  const clean = route.replace(/^\//, "").split("?")[0] || "dashboard";
  return clean || "dashboard";
}

/** Wait for element to appear in DOM (Layer 3 - MutationObserver for dynamic elements) */
function waitForElement(
  selector: string,
  callback: (el: Element) => void,
  timeoutMs = 5000
): () => void {
  const el = document.querySelector(selector);
  if (el) {
    callback(el);
    return () => {};
  }

  const observer = new MutationObserver(() => {
    const found = document.querySelector(selector);
    if (found) {
      observer.disconnect();
      callback(found);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  const timeout = setTimeout(() => observer.disconnect(), timeoutMs);

  return () => {
    observer.disconnect();
    clearTimeout(timeout);
  };
}

/** Get href from element or its link ancestor (for navigation steps) */
function getLinkHref(element: Element): string | null {
  const anchor = element.closest("a");
  if (anchor?.href) {
    try {
      const url = new URL(anchor.href);
      if (url.origin === window.location.origin) return url.pathname;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export const PageTour = React.forwardRef<PageTourRef, PageTourProps>(
  function PageTour({ pageId, steps, runOnMount = true, autoAdvanceOnTargetClick = false }, ref) {
    const pathname = usePathname();
    const router = useRouter();
    const storageKey = `${STORAGE_PREFIX}${pageId}-done`;
    const driverRef = useRef<Driver | null>(null);
    const tourStartedRef = useRef(false);
    const waitForElementCleanupRef = useRef<() => void>(() => {});

    const {
      updateTourState,
      updateTourStateForNavigation,
      clearTourState,
    } = useCrossTour(pageId, steps.length);

    /**
     * Filter steps that apply to the current route
     */
    const getApplicableSteps = useCallback((): PageTourStep[] => {
      return steps.filter((step) => !step.route || step.route === pathname);
    }, [steps, pathname]);

    /**
     * Attach click listener with { once: true } - immediately advance when target is clicked (Layer 1)
     */
    const attachStepClickListener = useCallback(
      (currentIndex: number, driverObj: Driver) => {
        if (!autoAdvanceOnTargetClick) return;

        const applicableSteps = getApplicableSteps();
        const step = applicableSteps[currentIndex] as PageTourStep | undefined;
        if (!step || !step.element) return;

        const advanceOn = step.autoAdvanceOn ?? "click";
        if (advanceOn === "manual") return;

        const selector = typeof step.element === "string" ? step.element : null;
        if (!selector) return;

        const advanceToNext = (clickedOrChangedElement: Element) => {
          const nextIndex = currentIndex + 1;
          const nextStep = applicableSteps[nextIndex];

          if (!nextStep) {
            updateTourState(currentIndex, false);
            driverObj.destroy();
            if (typeof window !== "undefined") {
              localStorage.setItem(storageKey, "true");
            }
            return;
          }

          const linkHref = getLinkHref(clickedOrChangedElement);
          const nextStepRoute = nextStep.route;

          if (linkHref && linkHref !== pathname) {
            waitForElementCleanupRef.current();
            updateTourStateForNavigation(routeToPageId(linkHref), linkHref);
            driverObj.destroy();
          } else if (nextStepRoute && nextStepRoute !== pathname) {
            waitForElementCleanupRef.current();
            updateTourStateForNavigation(routeToPageId(nextStepRoute), nextStepRoute);
            driverObj.destroy();
            router.push(nextStepRoute);
          } else {
            updateTourState(nextIndex, true);
            driverObj.drive(nextIndex);
            attachStepClickListener(nextIndex, driverObj);
          }
        };

        const attach = (targetElement: Element) => {
          const el = targetElement;
          if (advanceOn === "change") {
            const selectEl = el.querySelector?.("select") ?? (el.tagName === "SELECT" ? el : null);
            if (selectEl) {
              const changeHandler = () => advanceToNext(el);
              selectEl.addEventListener("change", changeHandler, { once: true });
            }
          } else {
            const clickHandler = () => advanceToNext(el);
            el.addEventListener("click", clickHandler, { once: true, capture: true });
          }
        };

        waitForElementCleanupRef.current();
        waitForElementCleanupRef.current = waitForElement(selector, attach);
      },
      [
        autoAdvanceOnTargetClick,
        getApplicableSteps,
        pathname,
        storageKey,
        updateTourState,
        updateTourStateForNavigation,
        router,
      ]
    );

    const startTour = useCallback(
      (startFromStep: number = 0) => {
        if (typeof window === "undefined") return;

        const applicableSteps = getApplicableSteps();
        if (applicableSteps.length === 0) return;

        const driverObj = driver({
          showProgress: applicableSteps.length > 1,
          steps: applicableSteps,
          nextBtnText: "Next",
          prevBtnText: "Back",
          doneBtnText: "Finish",
          progressText: "{{current}} of {{total}}",
          onHighlighted: (element, step, options) => {
            if (autoAdvanceOnTargetClick && options.state?.activeIndex != null) {
              setTimeout(() => attachStepClickListener(options.state.activeIndex!, driverObj), 50);
            }
          },
          onDestroyStarted: () => {
            waitForElementCleanupRef.current();
            clearTourState();
            if (typeof window !== "undefined") {
              localStorage.setItem(storageKey, "true");
            }
            driverObj.destroy();
          },
        });

        driverRef.current = driverObj;
        driverObj.drive(startFromStep);
        updateTourState(startFromStep, true);
      },
      [
        getApplicableSteps,
        storageKey,
        autoAdvanceOnTargetClick,
        attachStepClickListener,
        updateTourState,
        clearTourState,
      ]
    );

    useImperativeHandle(ref, () => ({ startTour }), [startTour]);

    useEffect(() => {
      if (typeof window === "undefined") return;

      const stored = localStorage.getItem(CROSS_TOUR_STORAGE_KEY);
      let resume = false;
      let stepIndex = 0;
      if (stored) {
        try {
          const state = JSON.parse(stored) as {
            isActive?: boolean;
            lastRoute?: string;
            currentStepIndex?: number;
          };
          if (state?.isActive) {
            resume = true;
            stepIndex =
              state.lastRoute === pathname ? (state.currentStepIndex ?? 0) : 0;
          }
        } catch {
          /* ignore parse errors */
        }
      }

      const runTour = () => {
        if (tourStartedRef.current) return;
        tourStartedRef.current = true;
        if (resume) {
          startTour(stepIndex);
        } else {
          startTour();
        }
      };

      if (!resume && !runOnMount) return;
      if (!resume) {
        const done = localStorage.getItem(storageKey);
        if (done) return;
      }

      const t = setTimeout(runTour, 500);
      return () => clearTimeout(t);
    }, []);

    useEffect(() => {
      return () => {
        waitForElementCleanupRef.current();
      };
    }, []);

    return null;
  }
);
