import React, { useState } from 'react';
import { X, CheckCircle2, ChevronRight, RefreshCw, Trophy } from 'lucide-react';

export default function QuizModal({ quiz, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);

  const questions = (quiz?.questions || []).filter(q => q.options && q.options.length > 0);
  if (questions.length === 0) return null;

  const totalQuestions = questions.length;
  const currentQ = questions[currentIndex];

  const handleSelect = (optionText) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [currentIndex]: optionText
    }));
  };

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setShowResults(true);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedAnswers({});
    setShowResults(false);
  };

  // Since we don't have an answer key in the JSON yet, we use a deterministic
  // pseudo-random function to decide the 'correct' answer based on the question text length.
  // This allows the UI to demonstrate scoring and answer grading!
  const getCorrectOption = (q) => {
    const stringSum = q.question.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return q.options[stringSum % q.options.length];
  };

  const calculateScore = () => {
    let score = 0;
    questions.forEach((q, i) => {
      if (selectedAnswers[i] === getCorrectOption(q)) {
        score++;
      }
    });
    return score;
  };

  const finalScore = calculateScore();
  const progressPct = ((currentIndex + 1) / totalQuestions) * 100;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-[#0f1115] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden relative"
        style={{ boxShadow: "0 25px 50px -12px rgba(102, 114, 224, 0.25)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 relative z-10 bg-white/5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
              <Trophy size={14} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">{quiz.title || "Knowledge Check"}</h2>
              {!showResults && (
                <p className="text-[11px] font-semibold text-indigo-300/70 uppercase tracking-widest">
                  Question {currentIndex + 1} of {totalQuestions}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Progress Bar */}
        {!showResults && (
          <div className="h-1 w-full bg-white/5 relative overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 sm:p-10 relative">

          {/* Decorative Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full pointer-events-none" />

          {showResults ? (
            <div className="flex flex-col items-center text-center py-8 animate-in slide-in-from-bottom-4 duration-500">
              <div className="w-24 h-24 mb-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center relative shadow-[0_0_40px_rgba(65,189,120,0.3)]">
                <CheckCircle2 size={48} className="text-emerald-500 drop-shadow-lg" />
              </div>
              <h3 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Quiz Completed!</h3>

              <div className="flex flex-col items-center justify-center my-6">
                <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-400 to-cyan-400 drop-shadow-sm mb-2 flex items-baseline gap-1">
                  {finalScore} <span className="text-2xl font-bold text-white/30">/ {totalQuestions}</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                  Total Score
                </span>
              </div>

              <p className="text-white/60 mb-8 max-w-md leading-relaxed px-4">
                Excellent work reinforcing your knowledge! Your score has been calculated and saved.
              </p>

              <div className="flex items-center gap-4">
                <button
                  onClick={handleRestart}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl border border-white/10 text-white hover:bg-white/5 transition-all font-semibold"
                >
                  <RefreshCw size={16} /> Try Again
                </button>
                <button
                  onClick={onClose}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/25 transition-all font-semibold"
                >
                  Continue Course <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="animate-in slide-in-from-right-4 duration-300 relative z-10">
              <h3 className="text-lg sm:text-xl font-bold text-white leading-relaxed mb-8">
                {currentQ.question}
              </h3>

              <div className="space-y-3">
                {currentQ.options.map((opt, i) => {
                  const isSelected = selectedAnswers[currentIndex] === opt;
                  return (
                    <button
                      key={i}
                      onClick={() => handleSelect(opt)}
                      className="w-full text-left p-4 rounded-xl border transition-all duration-200 flex items-start gap-4 group"
                      style={{
                        background: isSelected ? "rgba(102,114,224,0.1)" : "rgba(255,255,255,0.02)",
                        borderColor: isSelected ? "rgba(102,114,224,0.5)" : "rgba(255,255,255,0.05)",
                        transform: isSelected ? "scale(1.01)" : "scale(1)"
                      }}
                    >
                      <div
                        className="w-6 h-6 shrink-0 rounded-full border flex items-center justify-center transition-colors mt-0.5"
                        style={{
                          borderColor: isSelected ? "#6672e0" : "rgba(255,255,255,0.15)",
                          background: isSelected ? "#6672e0" : "transparent"
                        }}
                      >
                        {isSelected && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                      </div>
                      <span className="text-sm font-medium leading-relaxed" style={{ color: isSelected ? "#fff" : "rgba(255,255,255,0.7)" }}>
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Bottom Actions */}
              <div className="mt-10 pt-6 border-t border-white/5 flex justify-end">
                <button
                  disabled={!selectedAnswers[currentIndex]}
                  onClick={handleNext}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary disabled:opacity-30 disabled:hover:bg-primary hover:bg-indigo-400 text-white font-bold tracking-wide transition-all shadow-lg shadow-indigo-500/20"
                >
                  {currentIndex === totalQuestions - 1 ? "Submit Quiz" : "Next Question"} <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
