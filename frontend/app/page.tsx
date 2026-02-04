'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Dashboard() {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const cards = [
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
      link: '/documents',
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

  return (
    <div className="w-screen h-screen flex flex-col bg-gradient-to-br from-background to-background-alt overflow-hidden">
      {/* Header */}
      <div className="glass-border m-4 mb-0 py-6">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center text-2xl shadow-lg">
              ⚖️
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gradient mb-1">Legal Compliance Assistant</h1>
          <p className="text-sm text-gray-400">AI-Powered Legal Document Analysis & Compliance Checking</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl">
          {cards.map((card) => (
            <Link
              key={card.id}
              href={card.link}
              onMouseEnter={() => setHoveredCard(card.id)}
              onMouseLeave={() => setHoveredCard(null)}
              className={`group relative overflow-hidden rounded-2xl border-2 ${card.borderColor} bg-gradient-to-br ${card.color} p-8 transition-all duration-300 cursor-pointer ${
                hoveredCard === card.id
                  ? `transform scale-105 shadow-2xl ${card.hoverColor} shadow-2xl`
                  : 'shadow-lg'
              }`}
            >
              {/* Background Animation */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

              {/* Content */}
              <div className="relative z-10 flex flex-col h-full gap-6 items-center justify-center text-center">
                {/* Icon */}
                <div
                  className={`text-6xl transform transition-transform duration-300 ${
                    hoveredCard === card.id ? 'scale-110 rotate-12' : ''
                  }`}
                >
                  {card.icon}
                </div>

                {/* Title and Description */}
                <div>
                  <h2 className={`text-2xl font-bold ${card.accent} mb-3 transition-colors duration-300`}>
                    {card.title}
                  </h2>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {card.description}
                  </p>
                </div>

                {/* CTA Button */}
                <div className="mt-2">
                  <div
                    className={`inline-flex items-center gap-3 px-8 py-4 rounded-lg font-semibold transition-all duration-300 ${
                      hoveredCard === card.id
                        ? `${card.accent} bg-gray-700/40`
                        : 'text-gray-400 bg-gray-800/20'
                    }`}
                  >
                    <span>Open</span>
                    <span className={`transform transition-transform duration-300 ${hoveredCard === card.id ? 'translate-x-1' : ''}`}>
                      →
                    </span>
                  </div>
                </div>

                {/* Animated Border */}
                <div
                  className={`absolute inset-0 border-2 rounded-2xl transition-all duration-300 pointer-events-none ${card.borderColor} ${
                    hoveredCard === card.id ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{
                    animation: hoveredCard === card.id ? 'pulse 2s infinite' : 'none',
                  }}
                ></div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="glass-border m-4 mt-0 py-3">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <p>Legal Compliance RAG System v1.0</p>
          <p>Powered by AI</p>
        </div>
      </div>
    </div>
  );
}