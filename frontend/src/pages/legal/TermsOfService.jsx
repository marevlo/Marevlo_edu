import React from 'react';
import { Link } from 'react-router-dom';
import LegalShell, { LegalSection } from './LegalShell';

const SECTIONS = [
    { id: 'acceptance', title: 'Acceptance of these Terms' },
    { id: 'eligibility', title: 'Eligibility' },
    { id: 'accounts', title: 'Your account' },
    { id: 'acceptable-use', title: 'Acceptable use' },
    { id: 'content-licence', title: 'Courses and content licence' },
    { id: 'billing', title: 'Subscriptions, billing and payments' },
    { id: 'ugc', title: 'User-generated content' },
    { id: 'termination', title: 'Termination' },
    { id: 'disclaimers', title: 'Disclaimers and limitation of liability' },
    { id: 'governing-law', title: 'Governing law' },
    { id: 'changes', title: 'Changes to these Terms' },
    { id: 'contact', title: 'Contact' },
];

const UL = { margin: '10px 0 12px', paddingLeft: 22, listStyle: 'disc' };
const LI = { marginBottom: 6 };
const P = { margin: '0 0 12px' };

function B({ children }) {
    return <strong className="text-foreground" style={{ fontWeight: 700 }}>{children}</strong>;
}

function A({ href, children }) {
    return <a href={href} style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>{children}</a>;
}

function L({ to, children }) {
    return <Link to={to} style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>{children}</Link>;
}

export default function TermsOfService() {
    return (
        <LegalShell
            title="Terms of Service"
            lastUpdated="11 June 2026"
            intro="These Terms of Service govern your use of Marevlo — our courses, practice problems, coding workspace, MIRA AI tutor, community feed, messaging, project showcases and job board. Please read them carefully; by creating an account or using the platform you agree to be bound by them."
            sections={SECTIONS}
        >
            <LegalSection id="acceptance" title="1. Acceptance of these Terms">
                <p style={P}>
                    These Terms form a binding agreement between you and Marevlo (&ldquo;Marevlo&rdquo;, &ldquo;we&rdquo;,
                    &ldquo;us&rdquo;). You accept them by ticking the acceptance box at signup, by creating an account, or by
                    continuing to use the platform. Our{' '}
                    <L to="/legal/privacy">Privacy Policy</L>, <L to="/legal/refunds">Refund Policy</L> and{' '}
                    <L to="/legal/cookies">Cookie Policy</L> are part of these Terms by reference. If you do not agree, please
                    do not use Marevlo.
                </p>
            </LegalSection>

            <LegalSection id="eligibility" title="2. Eligibility">
                <ul style={UL}>
                    <li style={LI}>You must be at least <B>13 years old</B> to create a Marevlo account.</li>
                    <li style={LI}>
                        If you are under <B>18</B>, a parent or guardian must provide their email address and consent at
                        signup, as required by India's Digital Personal Data Protection Act, 2023. The guardian accepts these
                        Terms on the minor's behalf and is responsible for the minor's use of the platform.
                    </li>
                    <li style={LI}>You must provide a truthful date of birth; misrepresenting your age is a violation of these Terms.</li>
                </ul>
            </LegalSection>

            <LegalSection id="accounts" title="3. Your account">
                <ul style={UL}>
                    <li style={LI}>Provide accurate, current information at signup and keep it updated.</li>
                    <li style={LI}>Keep your password confidential. You are responsible for all activity under your account.</li>
                    <li style={LI}>One account per person. Do not share, sell or transfer your account.</li>
                    <li style={LI}>
                        Tell us at <A href="mailto:support@marevlo.com">support@marevlo.com</A> immediately if you suspect
                        unauthorised access. You can change your password anytime from Settings.
                    </li>
                </ul>
            </LegalSection>

            <LegalSection id="acceptable-use" title="4. Acceptable use">
                <p style={P}>
                    Marevlo is a learning community. You agree <B>not</B> to:
                </p>
                <ul style={UL}>
                    <li style={LI}>
                        <B>Cheat</B> — submit plagiarised solutions, use automated tools to farm XP, badges or leaderboard
                        positions, or misrepresent someone else's work as your own.
                    </li>
                    <li style={LI}>
                        <B>Scrape or copy</B> — crawl, scrape, bulk-download or republish course materials, problems, or other
                        platform content, or access the platform by automated means except through interfaces we provide.
                    </li>
                    <li style={LI}>
                        <B>Abuse others</B> — harass, threaten, defame or discriminate against anyone in the feed, comments,
                        chat or anywhere else on the platform, or post unlawful, obscene or hateful content.
                    </li>
                    <li style={LI}>
                        <B>Misuse the workspace</B> — use the in-browser coding workspace to attack other systems, mine
                        cryptocurrency, distribute malware, or interfere with the platform's operation.
                    </li>
                    <li style={LI}>
                        <B>Circumvent access controls</B> — bypass paywalls, entitlement checks, rate limits or security
                        measures, or probe the platform for vulnerabilities without our written permission.
                    </li>
                    <li style={LI}>
                        <B>Spam or impersonate</B> — post spam (including on the job board), impersonate any person, or create
                        accounts by automated means.
                    </li>
                </ul>
                <p style={P}>We may remove content and restrict or terminate accounts that violate this section.</p>
            </LegalSection>

            <LegalSection id="content-licence" title="5. Courses and content licence">
                <p style={P}>
                    All courses, lessons, problems, editorial content, MIRA outputs presented within the platform, designs,
                    logos and software are owned by Marevlo or its licensors and protected by copyright and other laws.
                </p>
                <ul style={UL}>
                    <li style={LI}>
                        While your subscription is active, we grant you a <B>personal, non-exclusive, non-transferable,
                        revocable licence</B> to access course content for your own learning.
                    </li>
                    <li style={LI}>
                        You may not redistribute, resell, publicly post or share course HTML, videos, notebooks, problem sets
                        or other materials, nor use them to build a competing course or train a competing product.
                    </li>
                    <li style={LI}>Code you write yourself in the workspace as part of solving exercises is yours.</li>
                </ul>
            </LegalSection>

            <LegalSection id="billing" title="6. Subscriptions, billing and payments">
                <p style={P}>
                    Current plans and prices are listed on our <L to="/plan">Plans page</L>. As of the date above they include:
                    Courses — <B>DSA at ₹1,999/month</B> and <B>Data Science + DSA at ₹2,999/month</B> (discounted annual
                    billing available); MIRA — a free tier, a <B>₹99 day-pass</B>, <B>Plus at ₹799/month</B> and{' '}
                    <B>Pro at ₹1,499/month</B>, plus one-time build packs and top-ups. Prices may change; changes apply from
                    your next billing cycle and we will notify you in advance.
                </p>
                <ul style={UL}>
                    <li style={LI}><B>Taxes.</B> All listed prices exclude GST, currently charged at 18%, which is added at checkout.</li>
                    <li style={LI}><B>Payments.</B> Payments are processed securely by <B>PayU</B>. We never store your card or banking details.</li>
                    <li style={LI}>
                        <B>Auto-renewal.</B> Monthly and annual subscriptions renew automatically at the end of each billing
                        period until you cancel. You can cancel anytime; cancellation takes effect at the end of the current
                        period and you keep access until then.
                    </li>
                    <li style={LI}><B>Day-passes and top-ups</B> are one-time purchases and do not renew.</li>
                    <li style={LI}><B>Refunds</B> are governed by our <L to="/legal/refunds">Refund Policy</L>.</li>
                    <li style={LI}>Courses and MIRA are billed separately; purchasing one does not include the other.</li>
                </ul>
            </LegalSection>

            <LegalSection id="ugc" title="7. User-generated content">
                <ul style={UL}>
                    <li style={LI}>
                        You retain ownership of content you post — feed posts, comments, messages, projects, profile content
                        and resumes.
                    </li>
                    <li style={LI}>
                        By posting, you grant Marevlo a worldwide, royalty-free, non-exclusive licence to host, store,
                        reproduce and display that content as needed to operate the platform (for example, showing your post
                        in the feed or your project on a showcase page). This licence ends when you delete the content or your
                        account, except for copies in backups or content others have re-shared within the platform.
                    </li>
                    <li style={LI}>You warrant that you have the rights to anything you post and that it does not violate any law or third-party right.</li>
                    <li style={LI}>
                        <B>Moderation.</B> We may review, remove or restrict content that violates these Terms or the law,
                        and may suspend accounts involved, with or without prior notice.
                    </li>
                </ul>
            </LegalSection>

            <LegalSection id="termination" title="8. Termination">
                <ul style={UL}>
                    <li style={LI}>
                        <B>By you.</B> You may stop using Marevlo at any time and delete your account from{' '}
                        <B>Settings → Delete account</B>. Deletion is permanent; see the{' '}
                        <L to="/legal/privacy">Privacy Policy</L> for what happens to your data.
                    </li>
                    <li style={LI}>
                        <B>By us.</B> We may suspend or terminate your account if you materially or repeatedly violate these
                        Terms, if required by law, or if your account presents a security risk. Where reasonable, we will warn
                        you first.
                    </li>
                    <li style={LI}>
                        Sections that by their nature should survive termination — including content licences you granted,
                        disclaimers, limitation of liability and governing law — survive.
                    </li>
                </ul>
            </LegalSection>

            <LegalSection id="disclaimers" title="9. Disclaimers and limitation of liability">
                <ul style={UL}>
                    <li style={LI}>
                        Marevlo is provided <B>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</B>. We work hard to keep the
                        platform reliable but do not warrant uninterrupted or error-free operation.
                    </li>
                    <li style={LI}>
                        <B>No outcome guarantees.</B> We provide education, not promises: completing courses or problems does
                        not guarantee exam results, interview success or employment.
                    </li>
                    <li style={LI}>
                        <B>Job board.</B> Listings on the job board are posted by third parties. We do not verify, endorse or
                        guarantee any listing, employer or hiring outcome, and we are not a party to any employment arrangement.
                    </li>
                    <li style={LI}>
                        <B>MIRA.</B> Our AI tutor can make mistakes. Verify important answers and do not rely on MIRA output as
                        professional advice.
                    </li>
                    <li style={LI}>
                        To the maximum extent permitted by law, Marevlo's total aggregate liability for any claim arising out
                        of or relating to the platform is limited to the amount you paid us in the <B>12 months</B> preceding
                        the claim, and we are not liable for indirect, incidental or consequential losses.
                    </li>
                    <li style={LI}>Nothing in these Terms limits liability that cannot be limited under Indian law.</li>
                </ul>
            </LegalSection>

            <LegalSection id="governing-law" title="10. Governing law">
                <p style={P}>
                    These Terms are governed by the laws of <B>India</B>. Subject to any mandatory consumer-protection rights
                    you may have, the courts at <B>[City to be confirmed]</B>, India shall have exclusive jurisdiction over
                    disputes arising from these Terms or your use of the platform.
                </p>
            </LegalSection>

            <LegalSection id="changes" title="11. Changes to these Terms">
                <p style={P}>
                    We may update these Terms from time to time. The &ldquo;Last updated&rdquo; date above reflects the current
                    version. For material changes we will notify you in the app or by email before they take effect.
                    Continuing to use Marevlo after changes take effect means you accept the updated Terms.
                </p>
            </LegalSection>

            <LegalSection id="contact" title="12. Contact">
                <p style={{ margin: 0 }}>
                    Questions about these Terms? Write to{' '}
                    <A href="mailto:support@marevlo.com">support@marevlo.com</A>.
                </p>
            </LegalSection>
        </LegalShell>
    );
}
