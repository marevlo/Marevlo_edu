import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { MotionConfig } from 'framer-motion';
import { ToastProvider, useToast } from './components/Toast';

import Layout from './components/Layout';
import LogoLoader from './components/LogoLoader';
import JobBoardGuard from './components/JobBoardGuard';
import CourseAccessGate from './components/CourseAccessGate';

import { loadAllTopics, loadProblemRaw } from './utils/topicsLoader';

// Lazy Load Pages
const LandingPage = React.lazy(() => import('./pages/LandingPage'));
const ProblemList = React.lazy(() => import('./pages/ProblemList'));
const IDE = React.lazy(() => import('./pages/IDE'));
const Feed = React.lazy(() => import('./pages/Feed'));
const Messages = React.lazy(() => import('./pages/Messages'));
const Project = React.lazy(() => import('./pages/Project'));
const Courses = React.lazy(() => import('./pages/Courses'));
const CourseContent = React.lazy(() => import('./pages/CourseContent'));
const JobBoard = React.lazy(() => import('./pages/JobBoard'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Login = React.lazy(() => import('./pages/Login'));
const Signup = React.lazy(() => import('./pages/Signup'));
const Plan = React.lazy(() => import('./pages/Plan'));
const AboutUs = React.lazy(() => import('./pages/AboutUs'));
const Research = React.lazy(() => import('./pages/Research'));
const ResearchPapers = React.lazy(() => import('./pages/ResearchPapers'));
const ResearchCourses = React.lazy(() => import('./pages/ResearchCourses'));
const ResearchCourseContent = React.lazy(() => import('./pages/ResearchCourseContent'));
const ResearchPaperContent = React.lazy(() => import('./pages/ResearchPaperContent'));
const T3TrackLanding = React.lazy(() => import('./pages/T3TrackLanding'));
const TopicProblems = React.lazy(() => import('./pages/TopicProblems'));
const PrivacyPolicy = React.lazy(() => import('./pages/legal/PrivacyPolicy'));
const TermsOfService = React.lazy(() => import('./pages/legal/TermsOfService'));
const RefundPolicy = React.lazy(() => import('./pages/legal/RefundPolicy'));
const CookiePolicy = React.lazy(() => import('./pages/legal/CookiePolicy'));
const Settings = React.lazy(() => import('./pages/Settings'));
const VerifyEmail = React.lazy(() => import('./pages/VerifyEmail'));
const PublicReelPage = React.lazy(() => import('./reels/PublicReelPage'));
const CreatorStudio = React.lazy(() => import('./reels/ReelsAdmin').then(m => ({ default: m.CreatorStudio })));
const ReelsModerationDashboard = React.lazy(() => import('./reels/ReelsAdmin').then(m => ({ default: m.ReelsModerationDashboard })));

export default function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <ToastProvider>
                    <Router>
                        <Routes>
                            <Route element={<Layout />}>
                                <Route path="/" element={<HomeHandler />} />
                                <Route path="/login" element={<LoginWrapper />} />
                                <Route path="/signup" element={<SignupWrapper />} />
                                <Route path="/problems" element={<ProblemWrapper />} />
                                <Route path="/problems/:topicId" element={<TopicProblems />} />
                                <Route path="/problems/:topicId/:id" element={<IDEWrapper />} />
                                <Route path="/ide" element={<IDEWrapper />} />
                                <Route path="/ide/:id" element={<IDEWrapper />} />
                                <Route path="/feed" element={<FeedWrapper />} />
                                <Route path="/messages" element={<MessagesWrapper />} />
                                <Route path="/project" element={<Project />} />
                                <Route path="/courses/*" element={<Courses />} />
                                <Route path="/course/:id" element={<CourseAccessGate><CourseContent /></CourseAccessGate>} />
                                <Route path="/jobs" element={<JobBoardGuard><JobBoard /></JobBoardGuard>} />
                                <Route path="/plan" element={<Plan />} />
                                <Route path="/profile" element={<Profile />} />
                                <Route path="/about" element={<AboutUs />} />
                                <Route path="/research" element={<Research />} />
                                <Route path="/research/papers" element={<ResearchPapers />} />
                                <Route path="/research/paper/:slug" element={<ResearchPaperContent />} />
                                <Route path="/research/courses/*" element={<ResearchCourses />} />
                                <Route path="/research/track/recommender-system" element={<T3TrackLanding />} />
                                <Route path="/research/course/:id" element={<ResearchCourseContent />} />
                                <Route path="/legal/privacy" element={<PrivacyPolicy />} />
                                <Route path="/legal/terms" element={<TermsOfService />} />
                                <Route path="/legal/refunds" element={<RefundPolicy />} />
                                <Route path="/legal/cookies" element={<CookiePolicy />} />
                                <Route path="/settings" element={<Settings />} />
                                <Route path="/verify-email" element={<VerifyEmail />} />
                                <Route path="/reels/:slug" element={<PublicReelPage />} />
                                <Route path="/reels/studio" element={<CreatorStudio />} />
                                <Route path="/admin/reels" element={<ReelsModerationDashboard />} />
                            </Route>
                        </Routes>
                    </Router>
                </ToastProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

function HomeHandler() {
    const { user } = useAuth();
    const navigate = useNavigate();
    return (
        <MotionConfig reducedMotion="user">
            <LandingPage onStart={() => navigate(user ? '/problems' : '/signup')} onExplore={() => navigate(user ? '/feed' : '/signup')} />
        </MotionConfig>
    );
}

function LoginWrapper() {
    const { login } = useAuth();
    const navigate = useNavigate();
    return <Login onLogin={(u) => { login(u); navigate('/feed'); }} onSignup={() => navigate('/signup')} />;
}

function SignupWrapper() {
    const navigate = useNavigate();
    const showToast = useToast();
    return <Signup onLogin={() => navigate('/login')} onSignupSuccess={(u) => { showToast('Account created! Check your email for a verification code.', 'success'); navigate('/verify-email?email=' + encodeURIComponent(u?.email || '')); }} />;
}

function ProblemWrapper() {
    const navigate = useNavigate();
    return <ProblemList onSelect={(p) => navigate(`/ide/${p.id}`)} />;
}

function FeedWrapper() {
    const { user } = useAuth();
    const navigate = useNavigate();
    return <Feed user={user} setView={(view) => navigate('/' + view)} />;
}

function MessagesWrapper() {
    const { user } = useAuth();
    const navigate = useNavigate();
    return <Messages user={user} setView={(view) => navigate('/' + view)} />;
}

function IDEWrapper() {
    const { addPoints } = useAuth();
    const navigate = useNavigate();
    const { id, topicId } = useParams();
    const [problem, setProblem] = React.useState(null);
    const [allProblems, setAllProblems] = React.useState([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        let cancelled = false;
        loadAllTopics().then(async topics => {
            const flat = topicId
                ? (topics.find(t => t.id === topicId)?.problems || [])
                : topics.flatMap(t => t.problems);
            const found = flat.find(p => String(p.id) === id);
            // Manifest entries are list metadata only — fetch this problem's
            // full JSON (statement, examples, solutions) on demand.
            const raw = found ? await loadProblemRaw(found._topicKey, found._vizFile) : null;
            if (cancelled) return;
            setAllProblems(flat);
            setProblem(raw ? { ...raw, _vizFile: found._vizFile, _topicKey: found._topicKey } : null);
            setLoading(false);
        }).catch(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [id, topicId]);

    const handleNext = () => {
        const currentIndex = allProblems.findIndex(p => String(p.id) === id);
        const nextProblem = currentIndex >= 0 && currentIndex < allProblems.length - 1
            ? allProblems[currentIndex + 1]
            : null;
        if (nextProblem) {
            navigate(topicId ? `/problems/${topicId}/${nextProblem.id}` : `/ide/${nextProblem.id}`);
        } else {
            navigate(topicId ? `/problems/${topicId}` : '/problems');
        }
    };

    const judgeTestCases = React.useMemo(() => {
        if (!problem?.examples) return [];
        return problem.examples
            .filter(ex => ex.output)
            .map(ex => ({ input: ex.input || '', expected_output: ex.output }));
    }, [problem]);

    if (loading) {
        return <LogoLoader label="Loading problem…" />;
    }

    return <IDE
        problem={problem}
        judgeTestCases={judgeTestCases}
        onBack={() => navigate(topicId ? `/problems/${topicId}` : '/problems')}
        onSolved={() => addPoints(50)}
        onNext={handleNext}
    />;
}
