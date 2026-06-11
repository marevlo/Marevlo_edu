import React from 'react';
import { Link } from 'react-router-dom';
import LegalShell, { LegalSection } from './LegalShell';

const SECTIONS = [
    { id: 'who-we-are', title: 'Who we are' },
    { id: 'data-we-collect', title: 'Information we collect' },
    { id: 'how-we-use', title: 'How we use your information' },
    { id: 'minors', title: 'Children and guardian consent' },
    { id: 'sharing', title: 'How we share your information' },
    { id: 'retention', title: 'Data retention' },
    { id: 'security', title: 'Security' },
    { id: 'your-rights', title: 'Your rights' },
    { id: 'grievance', title: 'Grievance redressal' },
    { id: 'cookies', title: 'Cookies and local storage' },
    { id: 'changes', title: 'Changes to this policy' },
    { id: 'contact', title: 'Contact us' },
];

const UL = { margin: '10px 0 12px', paddingLeft: 22, listStyle: 'disc' };
const LI = { marginBottom: 6 };
const P = { margin: '0 0 12px' };

function B({ children }) {
    return <strong className="text-foreground" style={{ fontWeight: 700 }}>{children}</strong>;
}

export default function PrivacyPolicy() {
    return (
        <LegalShell
            title="Privacy Policy"
            lastUpdated="11 June 2026"
            intro="This Privacy Policy explains what personal data Marevlo collects, why we collect it, how we protect it, and the rights you have over it. It is written to comply with India's Digital Personal Data Protection Act, 2023 (DPDP Act), and we additionally honour core protections of the EU General Data Protection Regulation (GDPR) for learners outside India."
            sections={SECTIONS}
        >
            <LegalSection id="who-we-are" title="1. Who we are">
                <p style={P}>
                    Marevlo (&ldquo;Marevlo&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is an online coding-education
                    platform operated from India. We provide structured courses (Data Structures &amp; Algorithms, Data Science),
                    curated practice problems with an in-browser coding workspace, MIRA — our AI tutor — a community feed,
                    direct messaging, project showcases, and a job board.
                </p>
                <p style={P}>
                    For the purposes of the DPDP Act, Marevlo is the <B>Data Fiduciary</B> for the personal data described in
                    this policy, and you (or, if you are under 18, your parent or guardian on your behalf) are the
                    <B> Data Principal</B>. You can reach us anytime at{' '}
                    <a href="mailto:support@marevlo.com" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>support@marevlo.com</a>.
                </p>
            </LegalSection>

            <LegalSection id="data-we-collect" title="2. Information we collect">
                <p style={P}>We collect the following categories of data, almost all of it provided directly by you:</p>
                <ul style={UL}>
                    <li style={LI}>
                        <B>Account data.</B> Your name, username, email address, password and date of birth. Passwords are
                        stored only as a one-way bcrypt hash — we never store or see your password in plain text. If you sign
                        in with Google, we receive your name, email and profile identifier from Google instead of a password.
                    </li>
                    <li style={LI}>
                        <B>Parent / guardian data.</B> If you are under 18, we collect a parent or guardian email address and a
                        record of their consent at signup, as required by the DPDP Act (see section 4).
                    </li>
                    <li style={LI}>
                        <B>Profile data.</B> Anything you add to your profile, such as an avatar, bio, links, and a resume if
                        you choose to upload one for the job board.
                    </li>
                    <li style={LI}>
                        <B>Learning data.</B> Course and lesson progress, problem submissions (including the code you write in
                        the workspace), quiz results, XP, levels, streaks, badges and leaderboard standing.
                    </li>
                    <li style={LI}>
                        <B>Content and communications.</B> Posts and comments on the community feed, direct messages,
                        project submissions, MIRA tutoring conversations, and bug reports you send us.
                    </li>
                    <li style={LI}>
                        <B>Payment data.</B> Payments are processed by <B>PayU</B>, our payment gateway. We receive order and
                        transaction identifiers, the plan purchased, the amount, and payment status. We <B>never</B> receive or
                        store your full card number, CVV, UPI PIN or banking credentials.
                    </li>
                    <li style={LI}>
                        <B>Device and log data.</B> IP address, browser type, timestamps, pages and API endpoints accessed,
                        and error reports — collected automatically for security, debugging and abuse prevention.
                    </li>
                </ul>
            </LegalSection>

            <LegalSection id="how-we-use" title="3. How we use your information">
                <p style={P}>We process your data only for the purposes you would reasonably expect from a learning platform:</p>
                <ul style={UL}>
                    <li style={LI}>Creating and operating your account, and delivering courses, problems, the workspace and MIRA.</li>
                    <li style={LI}>Tracking and displaying your learning progress, XP, streaks and achievements.</li>
                    <li style={LI}>Processing purchases and managing your subscription entitlements.</li>
                    <li style={LI}>Sending transactional email — verification codes, password resets, receipts — and, subject to your notification preferences, product updates and announcements.</li>
                    <li style={LI}>Operating community features (feed, chat, job board) and keeping them safe through moderation.</li>
                    <li style={LI}>Securing the platform: detecting fraud, abuse, cheating and unauthorised access.</li>
                    <li style={LI}>Complying with legal obligations, including tax and accounting requirements.</li>
                </ul>
                <p style={P}>
                    Our lawful basis under the DPDP Act is the <B>consent</B> you give at signup (you must accept this policy
                    and our <Link to="/legal/terms" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>Terms of Service</Link> to
                    create an account) and certain <B>legitimate uses</B> permitted by the Act, such as responding to your own
                    requests and complying with law. For GDPR purposes, processing is based on performance of our contract
                    with you, your consent, and our legitimate interests in securing the service.
                </p>
            </LegalSection>

            <LegalSection id="minors" title="4. Children and guardian consent">
                <p style={P}>
                    Marevlo is intended for learners aged <B>13 and above</B>. We ask for your date of birth at signup so we
                    can apply the right protections.
                </p>
                <ul style={UL}>
                    <li style={LI}>
                        If you are under 18, the DPDP Act requires verifiable consent from a parent or guardian before we
                        process your data. Our signup form collects a <B>parent / guardian email</B> and an explicit consent
                        confirmation; an account cannot be created without them.
                    </li>
                    <li style={LI}>
                        We do not use the data of users under 18 for behavioural tracking or targeted advertising. (We do not
                        run advertising for any users — see our <Link to="/legal/cookies" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>Cookie Policy</Link>.)
                    </li>
                    <li style={LI}>
                        A parent or guardian may withdraw consent at any time by writing to{' '}
                        <a href="mailto:support@marevlo.com" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>support@marevlo.com</a> from
                        the guardian email on record. We will close the account and erase the associated personal data as
                        described in section 6.
                    </li>
                </ul>
            </LegalSection>

            <LegalSection id="sharing" title="5. How we share your information">
                <p style={P}>
                    <B>We do not sell your personal data, ever.</B> We share it only with the service providers (Data
                    Processors) that we need to run the platform, each bound by contract to use it solely on our instructions:
                </p>
                <ul style={UL}>
                    <li style={LI}>
                        <B>Amazon Web Services (AWS)</B> — hosting, databases and file storage in the
                        <B> ap-south-1 (Mumbai, India)</B> region, so your data stays in India by default.
                    </li>
                    <li style={LI}><B>PayU</B> — payment processing for plans, day-passes and top-ups.</li>
                    <li style={LI}><B>Google Firebase</B> — authentication when you choose &ldquo;Sign in with Google&rdquo;.</li>
                    <li style={LI}><B>Amazon SES</B> — delivery of transactional and notification email.</li>
                </ul>
                <p style={P}>
                    Beyond these processors, we disclose personal data only if required by law, court order, or a competent
                    authority, or where necessary to protect the rights, safety or property of Marevlo and its users. Content
                    you choose to make public — feed posts, comments, your public profile, project showcases — is visible to
                    other users by design.
                </p>
            </LegalSection>

            <LegalSection id="retention" title="6. Data retention">
                <ul style={UL}>
                    <li style={LI}>We keep your personal data for as long as your account is active.</li>
                    <li style={LI}>
                        When you delete your account (Settings → Delete account, or by emailing us), your profile, learning
                        data, posts and messages are deleted or irreversibly anonymised.
                    </li>
                    <li style={LI}>
                        Payment and invoicing records are retained for the period required by Indian tax and accounting law
                        (for example, GST record-keeping requirements), even after account deletion.
                    </li>
                    <li style={LI}>Residual copies in encrypted backups are purged on our routine backup rotation cycle.</li>
                </ul>
            </LegalSection>

            <LegalSection id="security" title="7. Security">
                <p style={P}>We apply reasonable security safeguards as required by the DPDP Act, including:</p>
                <ul style={UL}>
                    <li style={LI}>Encryption in transit (TLS/HTTPS) for all traffic, and encryption at rest for stored data.</li>
                    <li style={LI}>Password hashing with bcrypt — plain-text passwords are never stored.</li>
                    <li style={LI}>Token-based authentication with short-lived access tokens and rotating refresh tokens.</li>
                    <li style={LI}>Least-privilege access controls and logging on our infrastructure.</li>
                </ul>
                <p style={P}>
                    No system is perfectly secure. If you believe your account has been compromised, change your password in
                    Settings and contact <a href="mailto:support@marevlo.com" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>support@marevlo.com</a> immediately.
                    We will notify you and the Data Protection Board of India of personal data breaches as the DPDP Act requires.
                </p>
            </LegalSection>

            <LegalSection id="your-rights" title="8. Your rights">
                <p style={P}>Under the DPDP Act you have the right to:</p>
                <ul style={UL}>
                    <li style={LI}><B>Access</B> — request a summary of the personal data we hold about you and how it is processed.</li>
                    <li style={LI}><B>Correction and updating</B> — fix inaccurate or incomplete data, directly from your Profile and Settings pages or by contacting us.</li>
                    <li style={LI}><B>Erasure</B> — delete your account and personal data yourself via <B>Settings → Delete account</B>, or by emailing us.</li>
                    <li style={LI}><B>Withdraw consent</B> — at any time, with the same ease you gave it; the service may stop working for you once consent is withdrawn.</li>
                    <li style={LI}><B>Grievance redressal</B> — raise a complaint with us (section 9) and, if unresolved, with the Data Protection Board of India.</li>
                    <li style={LI}><B>Nominate</B> — designate another person to exercise these rights on your behalf in case of death or incapacity.</li>
                </ul>
                <p style={P}>
                    If you are in the European Economic Area or the UK, you additionally have GDPR rights of access,
                    rectification, erasure, restriction, portability and objection, and the right to lodge a complaint with
                    your local supervisory authority. We honour these on request.
                </p>
            </LegalSection>

            <LegalSection id="grievance" title="9. Grievance redressal">
                <p style={P}>
                    For any privacy concern, complaint or request, contact our Grievance Officer:
                </p>
                <ul style={UL}>
                    <li style={LI}><B>Grievance Officer:</B> [Grievance Officer name to be appointed]</li>
                    <li style={LI}><B>Email:</B> <a href="mailto:support@marevlo.com" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>support@marevlo.com</a> (subject line: &ldquo;Privacy Grievance&rdquo;)</li>
                </ul>
                <p style={P}>
                    We acknowledge grievances promptly and aim to resolve them within the timelines prescribed under the DPDP
                    Act and its rules. If you are not satisfied with our response, you may escalate to the Data Protection
                    Board of India.
                </p>
            </LegalSection>

            <LegalSection id="cookies" title="10. Cookies and local storage">
                <p style={P}>
                    Marevlo primarily uses browser <B>local storage</B> — not tracking cookies — to keep you signed in and
                    remember preferences like dark mode. We do not use advertising or third-party analytics cookies. The full
                    list of what we store, and the third-party storage set by Google Firebase and PayU, is in our{' '}
                    <Link to="/legal/cookies" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>Cookie Policy</Link>.
                </p>
            </LegalSection>

            <LegalSection id="changes" title="11. Changes to this policy">
                <p style={P}>
                    We may update this policy as the platform or the law evolves. The &ldquo;Last updated&rdquo; date at the
                    top always reflects the current version. For material changes — especially any that expand how we use your
                    data — we will notify you in the app or by email before they take effect.
                </p>
            </LegalSection>

            <LegalSection id="contact" title="12. Contact us">
                <p style={P}>
                    Marevlo · India ·{' '}
                    <a href="mailto:support@marevlo.com" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>support@marevlo.com</a>
                </p>
                <p style={{ margin: 0 }}>
                    We're happy to answer any question about this policy or about how your data is handled.
                </p>
            </LegalSection>
        </LegalShell>
    );
}
