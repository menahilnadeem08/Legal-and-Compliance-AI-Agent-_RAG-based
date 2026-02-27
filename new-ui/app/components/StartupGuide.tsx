"use client";

import React, { useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

const TOUR_STORAGE_KEY = "legal-rag-tour-done";

export interface StartupGuideRef {
  startTour: () => void;
}

const baseSteps: DriveStep[] = [
  {
    element: "[data-tour='welcome']",
    popover: {
      title: "Welcome to Legal RAG!",
      description: "This is your dashboard. Let's take a quick tour of the key features.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: "[data-tour='documents']",
    popover: {
      title: "Documents",
      description: "View and manage your legal documents here. Your document library powers the AI assistant.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='chat']",
    popover: {
      title: "Chat",
      description: "Ask questions about your documents using natural language. The AI will search your knowledge base and provide answers.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='profile']",
    popover: {
      title: "Profile",
      description: "Access your profile and account settings.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='getting-started']",
    popover: {
      title: "You're all set!",
      description: "Upload documents, start a chat, and explore. You can restart this tour anytime from the dashboard.",
      side: "top",
      align: "center",
    },
  },
];

const adminSteps: DriveStep[] = [
  {
    element: "[data-tour='upload']",
    popover: {
      title: "Upload",
      description: "Upload new legal documents to expand your knowledge base. Supports PDF and other common formats.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='categories']",
    popover: {
      title: "Categories",
      description: "Organize documents into categories for easier navigation and filtering.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='admin']",
    popover: {
      title: "Add Employee",
      description: "Manage team members and add employees to your organization.",
      side: "bottom",
      align: "center",
    },
  },
];

function buildSteps(isAdmin: boolean): DriveStep[] {
  const steps = [...baseSteps];
  if (isAdmin) {
    steps.splice(3, 0, ...adminSteps);
  }
  return steps;
}

export interface StartupGuideProps {
  isAdmin?: boolean;
  runOnMount?: boolean;
}

export const StartupGuide = React.forwardRef<StartupGuideRef, StartupGuideProps>(
  function StartupGuide({ isAdmin = false, runOnMount = true }, ref) {
    const driverRef = useRef<Driver | null>(null);

    const startTour = useCallback(() => {
      if (typeof window === "undefined") return;
      const steps = buildSteps(isAdmin);
      const driverObj = driver({
        showProgress: true,
        steps,
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Finish",
        progressText: "{{current}} of {{total}}",
        onDestroyStarted: () => {
          if (typeof window !== "undefined") {
            localStorage.setItem(TOUR_STORAGE_KEY, "true");
          }
          driverObj.destroy();
        },
      });
      driverRef.current = driverObj;
      driverObj.drive();
    }, [isAdmin]);

    useImperativeHandle(ref, () => ({ startTour }), [startTour]);

    useEffect(() => {
      if (!runOnMount) return;
      if (typeof window === "undefined") return;
      const done = localStorage.getItem(TOUR_STORAGE_KEY);
      if (!done) {
        // Small delay so the DOM is ready
        const t = setTimeout(startTour, 500);
        return () => clearTimeout(t);
      }
    }, [runOnMount, startTour]);

    return null;
  }
);
