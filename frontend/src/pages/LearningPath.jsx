import { useState, useEffect } from "react";
import { Check, Play, Lock } from "lucide-react";

const initialLessons = [
  {
    id: 1,
    title: "Introduction to Cognition",
    duration: "5 min",
    content:
      "You're covered the basics! This lesson introduces the foundation of cognition and how humans process information."
  },
  {
    id: 2,
    title: "Memory & Cognition",
    duration: "10 min",
    content:
      "These information processing systems are involved in memory, attention, language, and problem-solving."
  },
  {
    id: 3,
    title: "Learning in the Digital Age",
    duration: "15 min",
    content:
      "Modern learning systems leverage digital tools to enhance cognition and engagement."
  },
  {
    id: 4,
    title: "Cognitive Biases",
    duration: "12 min",
    content:
      "Understand the hidden mental shortcuts that influence decision-making."
  },
  {
    id: 5,
    title: "Cognitive Biases & Decision Making",
    duration: "18 min",
    content:
      "Explore how biases shape complex decisions in real-world scenarios."
  }
];

export default function LearningPath() {
  const [lessons, setLessons] = useState([]);
  const [activeLesson, setActiveLesson] = useState(1);
  const [completed, setCompleted] = useState([]);

  /* ---------------- LOAD FROM STORAGE ---------------- */
  useEffect(() => {
    const saved = localStorage.getItem("learningProgress");
    if (saved) {
      const parsed = JSON.parse(saved);
      setLessons(parsed.lessons);
      setActiveLesson(parsed.activeLesson);
      setCompleted(parsed.completed);
    } else {
      const enriched = initialLessons.map((l, i) => ({
        ...l,
        status: i === 0 ? "current" : "locked"
      }));
      setLessons(enriched);
    }
  }, []);

  /* ---------------- SAVE TO STORAGE ---------------- */
  useEffect(() => {
    if (lessons.length > 0) {
      localStorage.setItem(
        "learningProgress",
        JSON.stringify({ lessons, activeLesson, completed })
      );
    }
  }, [lessons, activeLesson, completed]);

  const currentIndex = lessons.findIndex(l => l.id === activeLesson);
  const currentLesson = lessons[currentIndex];

  /* ---------------- COMPLETE + UNLOCK ---------------- */
  const handleNext = () => {
    if (currentIndex < lessons.length) {
      const updated = [...lessons];

      // Mark current as done
      updated[currentIndex].status = "done";

      if (currentIndex + 1 < updated.length) {
        updated[currentIndex + 1].status = "current";
        setActiveLesson(updated[currentIndex + 1].id);
      }

      setCompleted([...completed, activeLesson]);
      setLessons(updated);
    }
  };

  const progress = Math.round(
    (completed.length / lessons.length) * 100
  ) || 0;

  const isCourseComplete =
    completed.length === lessons.length;

  return (
    <div className="min-h-screen bg-app-bg flex p-12 gap-16 transition-colors duration-300">

      {/* LEFT SIDE */}
      <div className="w-1/3 relative">
        <h2 className="text-xl font-semibold mb-6 text-primary-text">
          Learning Path
        </h2>

        {/* Progress Bar */}
        <div className="w-full bg-surface-hover rounded-full h-2 mb-8">
          <div
            className="bg-accent h-2 rounded-full transition-all duration-700"
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        {/* Timeline Line */}
        <div className="absolute left-4 top-20 bottom-0 w-[2px] bg-border-color"></div>

        <div className="space-y-10">
          {lessons.map((lesson) => {
            const isActive = lesson.id === activeLesson;
            const isDone = lesson.status === "done";
            const isLocked = lesson.status === "locked";

            return (
              <div
                key={lesson.id}
                onClick={() =>
                  !isLocked && setActiveLesson(lesson.id)
                }
                className={`flex items-start gap-6 transition cursor-pointer
                  ${isLocked ? "blur-sm opacity-60 pointer-events-none" : ""}
                `}
              >
                {/* Node */}
                <div
                  className={`relative z-10 w-8 h-8 flex items-center justify-center rounded-full border-2 transition-all duration-500
                    ${
                      isDone
                        ? "bg-green-100 dark:bg-green-900/50 border-green-500"
                        : isActive
                        ? "bg-accent border-accent shadow-lg shadow-accent/30 animate-pulse"
                        : "bg-surface border-border-color"
                    }`}
                >
                  {isDone ? (
                    <Check size={16} className="text-green-500" />
                  ) : isLocked ? (
                    <Lock size={14} className="text-muted-text" />
                  ) : (
                    <Play size={14} className="text-white" />
                  )}
                </div>

                {/* Content */}
                <div
                  className={`p-4 rounded-xl transition-all duration-500
                    ${
                      isActive
                        ? "bg-accent/10 shadow-md scale-105"
                        : ""
                    }`}
                >
                  <h3 className="font-medium text-primary-text">
                    {lesson.title}
                  </h3>
                  <p className="text-sm text-muted-text">
                    {lesson.duration}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-card-bg w-full max-w-2xl rounded-3xl shadow-2xl p-10 relative transition-all duration-500 border border-border-color">

          <h2 className="text-3xl font-semibold mb-6 text-primary-text transition-opacity duration-500">
            {currentLesson?.title}
          </h2>

          <hr className="mb-6 border-border-color" />

          <p className="text-muted-text leading-relaxed mb-12 transition-opacity duration-500">
            {currentLesson?.content}
          </p>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-text">
              {progress}% completed
            </span>

            {!isCourseComplete ? (
              <button
                onClick={handleNext}
                className="px-6 py-3 bg-primary text-app-bg rounded-full shadow-md hover:bg-secondary transition"
              >
                Next idea →
              </button>
            ) : (
              <div className="text-green-600 dark:text-green-400 font-medium">
                🎉 Course Completed!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
