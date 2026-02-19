'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navigation from './components/Navigation';
import PageContainer from './components/PageContainer';
import { getAuthToken, isEmployeeUser } from './utils/auth';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [isEmployee, setIsEmployee] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isEmployeeUser()) {
      setIsEmployee(true);
      setIsLoading(false);
      return;
    }

    if (status === 'loading') return;

    if (getAuthToken(session)) {
      setIsEmployee(false);
      setIsLoading(false);
      return;
    }

    if (status === 'unauthenticated' && !localStorage.getItem('adminToken')) {
      router.push('/auth/login');
      setIsLoading(false);
    }
  }, [status, session, router]);

  // Show loading state while checking authentication
  if (isLoading || status === 'loading') {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-background to-background-alt">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // All cards available for admin
  const allCards = [
    {
      id: 'upload',
      icon: '📤',
      title: 'Upload Document',
      description: 'Add legal documents to your knowledge base',
      link: '/upload',
      color: 'from-blue-500/20 to-blue-600/20',
      borderColor: 'border-blue-500/50',
      hoverColor: 'hover:shadow-blue-500/50',
      accent: 'text-blue-300',
    },
    {
      id: 'documents',
      icon: '📚',
      title: 'Document Library',
      description: 'Browse and manage your documents',
      link: '/document',
      color: 'from-green-500/20 to-green-600/20',
      borderColor: 'border-green-500/50',
      hoverColor: 'hover:shadow-green-500/50',
      accent: 'text-green-300',
    },
    {
      id: 'chat',
      icon: '💬',
      title: 'Chat Assistant',
      description: 'Ask questions about your documents',
      link: '/chat',
      color: 'from-cyan-500/20 to-cyan-600/20',
      borderColor: 'border-cyan-500/50',
      hoverColor: 'hover:shadow-cyan-500/50',
      accent: 'text-cyan-300',
    },
  ];

  // Employee only sees documents and chat
  const employeeCards = allCards.filter(card => card.id !== 'upload');

  // Show appropriate cards based on role
  const cards = isEmployee ? employeeCards : allCards;

return (
  <>
    <Navigation />
    <PageContainer>
      <div className="max-w-7xl mx-auto w-full h-full flex flex-col">
        {/* Hero Section - Compact */}
        <div className="w-full py-6 sm:py-8 flex justify-center flex-shrink-0">
          <div className="text-center max-w-3xl mx-auto">
            {/* Icon */}
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-blue-500/30 to-blue-600/30 border border-blue-500/50 flex items-center justify-center text-3xl sm:text-4xl shadow-lg">
                ⚖️
              </div>
            </div>

            {/* Title and Subtitle - Compact */}
            <h1 className="text-3xl sm:text-4xl font-bold text-gradient mb-2">
              Legal Compliance Assistant
            </h1>
            <p className="text-sm sm:text-base text-gray-400">
              AI-Powered Legal Document Analysis & Compliance Checking
            </p>
          </div>
        </div>

        {/* Cards Section - Centered */}
        <div className="w-full flex justify-center flex-1 min-h-0 items-center">
          <div className={`w-full ${isEmployee ? 'max-w-3xl' : 'max-w-5xl'}`}>
            <div className={`grid gap-6 w-full ${
              isEmployee 
                ? 'grid-cols-1 sm:grid-cols-2' 
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            }`}>
              {cards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => router.push(card.link)}
                  onMouseEnter={() => setHoveredCard(card.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className="w-full"
                >
                  <div
                    className={`group relative overflow-hidden rounded-xl border-2 ${card.borderColor} bg-gradient-to-br ${card.color} p-6 sm:p-8 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center text-center h-56 sm:h-64 ${
                      hoveredCard === card.id
                        ? `transform scale-105 shadow-xl ${card.hoverColor}`
                        : 'shadow-lg hover:shadow-xl'
                    }`}
                  >
                    {/* Background Animation */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                    {/* Content */}
                    <div className="relative z-10 flex flex-col items-center justify-center gap-3 h-full">
                      {/* Icon */}
                      <div
                        className={`text-5xl sm:text-6xl transform transition-transform duration-300 ${
                          hoveredCard === card.id ? 'scale-110' : ''
                        }`}
                      >
                        {card.icon}
                      </div>

                      {/* Title */}
                      <h2 className={`text-lg sm:text-xl font-bold ${card.accent} transition-colors duration-300`}>
                        {card.title}
                      </h2>

                      {/* Description */}
                      <p className="text-gray-400 text-xs sm:text-sm leading-relaxed max-w-xs">
                        {card.description}
                      </p>

                      {/* CTA Button */}
                      <div
                        className={`inline-flex items-center gap-2 px-6 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-all duration-300 mt-1 ${
                          hoveredCard === card.id
                            ? `${card.accent} bg-gray-700/40`
                            : 'text-gray-300 bg-gray-800/20'
                        }`}
                      >
                        <span>Open</span>
                        <span className={`transform transition-transform ${hoveredCard === card.id ? 'translate-x-0.5' : ''}`}>
                          →
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer - Compact */}
        <div className="w-full border-t border-gray-700/50 pt-4 pb-2 flex-shrink-0">
          <div className="w-full flex flex-col items-center justify-center gap-1 text-xs text-gray-600">
            <p className="text-center">Legal Compliance RAG System v1.0</p>
            <p className="text-center">Powered by AI</p>
          </div>
        </div>
      </div>
    </PageContainer>
  </>
);
}