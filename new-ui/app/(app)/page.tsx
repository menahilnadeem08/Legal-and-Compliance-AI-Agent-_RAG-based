"use client";

import { useRouter } from "next/navigation";
import { EMPLOYEE_LOGIN_PATH } from "@/app/utils/auth";
import { useTheme } from "@/app/theme-provider";
import {
  Sparkles,
  Search,
  CheckCircle,
  Zap,
  BookOpen,
  Lock,
  BarChart3,
  ArrowRight,
  Gavel,
  Moon,
  Sun,
} from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const { theme, toggleTheme, mounted } = useTheme();

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
      {/* Navigation — same background as hero for a unified top */}
      <nav className="fixed top-0 w-full bg-white dark:bg-slate-900 z-50 border-b border-slate-100 dark:border-slate-800 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.2)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gavel className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <span className="text-xl font-bold text-slate-900 dark:text-white">Legal RAG</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="w-5 h-5 text-amber-400" />
              ) : (
                <Moon className="w-5 h-5 text-slate-700" />
              )}
            </button>

          </div>
        </div>
      </nav>

      {/* Hero Section — white at top to match header, then soft gradient */}
      <section className="pt-0 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white to-blue-50/80 dark:from-slate-900 dark:to-slate-950" style={{ paddingTop: '80px' }}>
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-full px-4 py-2 mb-8">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-700 dark:text-blue-300">AI-Powered Legal Intelligence</span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold mb-6 max-w-3xl mx-auto leading-tight">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
              Your Legal &amp; Compliance
            </span>
            <br />
            <span>Knowledge Base</span>
          </h1>

          <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-2xl mx-auto">
            Navigate complex legal documents, regulatory requirements, and compliance policies with AI-powered answers grounded in your organization's approved documentation.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <button
              onClick={() => router.push(EMPLOYEE_LOGIN_PATH)}
              className="group px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold flex items-center justify-center gap-2 text-white"
            >
              Start Exploring
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => router.push("/auth/admin/signup")}
              className="px-8 py-4 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg font-semibold border border-slate-300 dark:border-slate-600"
            >
              Admin Access
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Powerful Features</h2>
            <p className="text-slate-600 dark:text-slate-400 text-lg max-w-2xl mx-auto">
              Enterprise-grade legal document management and AI-powered retrieval
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Search,
                title: "Hybrid Search",
                description: "Semantic + keyword search combining vector embeddings with BM25 for precise results",
              },
              {
                icon: CheckCircle,
                title: "Source Citations",
                description: "Every answer backed by exact citations from your approved legal documents",
              },
              {
                icon: Zap,
                title: "Confidence Scoring",
                description: "Transparent confidence metrics for every response based on source relevance",
              },
              {
                icon: BookOpen,
                title: "Multi-Document Support",
                description: "Seamlessly process PDFs, DOCX files, and other legal document formats",
              },
              {
                icon: Lock,
                title: "Version-Aware Retrieval",
                description: "Track and retrieve specific document versions for compliance audits",
              },
              {
                icon: Sparkles,
                title: "Cross-Encoder Reranking",
                description: "AI-powered result reranking via Cohere for optimal answer relevance",
              },
            ].map((feature, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-lg dark:hover:shadow-blue-900/20"
              >
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-slate-600 dark:text-slate-400 text-lg max-w-2xl mx-auto">
              Three simple steps to get AI-powered legal insights
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Upload Documents",
                description: "Upload your legal documents, policies, contracts, and regulatory files in PDF or DOCX format",
              },
              {
                step: "2",
                title: "Ask Questions",
                description: "Query your knowledge base in plain language. Our AI understands complex legal terminology",
              },
              {
                step: "3",
                title: "Get Grounded Answers",
                description: "Receive AI-generated answers with exact citations, confidence scores, and source references",
              },
            ].map((item, idx) => (
              <div key={idx} className="relative">
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-2xl font-bold mb-6 relative z-10 text-white shadow-lg">
                    {item.step}
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center h-full">
                    <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                    <p className="text-slate-600 dark:text-slate-400">{item.description}</p>
                  </div>
                </div>
                {idx < 2 && (
                  <div className="hidden md:block absolute top-8 right-0 transform translate-x-1/2 text-3xl text-slate-300 dark:text-slate-700">
                    →
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Document Types Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Supported Document Types</h2>
            <p className="text-slate-600 dark:text-slate-400 text-lg max-w-2xl mx-auto">
              Manage all your compliance documentation
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                emoji: "📋",
                title: "Policies",
                description: "Internal policies, procedures, and guidelines. Define organizational standards and best practices.",
              },
              {
                emoji: "📝",
                title: "Contracts",
                description: "Client agreements, vendor contracts, and legal frameworks. Ensure compliance across partnerships.",
              },
              {
                emoji: "⚖️",
                title: "Regulations",
                description: "Industry regulations, compliance requirements, and statutory obligations. Stay audit-ready.",
              },
            ].map((docType, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-lg dark:hover:shadow-blue-900/20"
              >
                <div className="text-5xl mb-4">{docType.emoji}</div>
                <h3 className="text-2xl font-semibold mb-3">{docType.title}</h3>
                <p className="text-slate-600 dark:text-slate-400">{docType.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-slate-950">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 border border-blue-300 dark:border-blue-700 rounded-2xl p-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Transform Legal Operations?</h2>
            <p className="text-slate-700 dark:text-slate-300 text-lg mb-8 max-w-2xl mx-auto">
              Join organizations taking control of their legal and compliance processes with AI-powered insights.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => router.push(EMPLOYEE_LOGIN_PATH)}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold text-white"
              >
                Employee Login
              </button>
              <button
                onClick={() => router.push("/auth/admin/signup")}
                className="px-8 py-4 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg font-semibold border border-slate-300 dark:border-slate-600"
              >
                Join as Admin
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-8 px-4 sm:px-6 lg:px-8 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between">
            <div className="flex items-center gap-2 mb-4 sm:mb-0">
              <Gavel className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="font-semibold">Legal RAG</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-sm">© 2026 Legal RAG Agent. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}