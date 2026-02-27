"use client";

import React, { useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

export interface PageTourRef {
  startTour: () => void;
}

export interface PageTourProps {
  /** Unique page identifier for localStorage (e.g. "chat", "upload") */
  pageId: string;
  /** Tour steps for this page */
  steps: DriveStep[];
  /** Auto-run on first visit. Default true. */
  runOnMount?: boolean;
}

const STORAGE_PREFIX = "legal-rag-tour-";

export const PageTour = React.forwardRef<PageTourRef, PageTourProps>(
  function PageTour({ pageId, steps, runOnMount = true }, ref) {
    const storageKey = `${STORAGE_PREFIX}${pageId}-done`;

    const startTour = useCallback(() => {
      if (typeof window === "undefined") return;
      const driverObj = driver({
        showProgress: steps.length > 1,
        steps,
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Finish",
        progressText: "{{current}} of {{total}}",
        onDestroyStarted: () => {
          if (typeof window !== "undefined") {
            localStorage.setItem(storageKey, "true");
          }
          driverObj.destroy();
        },
      });
      driverObj.drive();
    }, [steps, storageKey]);

    useImperativeHandle(ref, () => ({ startTour }), [startTour]);

    useEffect(() => {
      if (!runOnMount) return;
      if (typeof window === "undefined") return;
      const done = localStorage.getItem(storageKey);
      if (!done) {
        const t = setTimeout(startTour, 500);
        return () => clearTimeout(t);
      }
    }, [runOnMount, startTour, storageKey]);

    return null;
  }
);
