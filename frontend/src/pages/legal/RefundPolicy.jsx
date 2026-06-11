import React from 'react';
import { Link } from 'react-router-dom';
import LegalShell, { LegalSection } from './LegalShell';

const SECTIONS = [
    { id: 'overview', title: 'Overview' },
    { id: 'course-subscriptions', title: 'Course subscriptions' },
    { id: 'renewals', title: 'Renewal charges' },
    { id: 'mira', title: 'MIRA plans and day-passes' },
    { id: 'topups', title: 'Top-ups and build packs' },
    { id: 'how-to-request', title: 'How to request a refund' },
    { id: 'gst', title: 'GST treatment' },
    { id: 'exceptions', title: 'Exceptions' },
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

export default function RefundPolicy() {
    return (
        <LegalShell
            title="Refund Policy"
            lastUpdated="11 June 2026"
            intro="We want you to buy Marevlo with confidence. This policy explains exactly when course subscriptions, MIRA plans, day-passes, build packs and top-ups are refundable, and how to ask for a refund. It applies to all purchases made on marevlo.com and forms part of our Terms of Service."
            sections={SECTIONS}
        >
            <LegalSection id="overview" title="1. Overview">
                <p style={P}>
                    Marevlo sells two separate product families, both listed on our{' '}
                    <Link to="/plan" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>Plans page</Link>:
                </p>
                <ul style={UL}>
                    <li style={LI}>
                        <B>Course subscriptions</B> — DSA (₹1,999/month) and Data Science + DSA (₹2,999/month), with
                        discounted annual billing.
                    </li>
                    <li style={LI}>
                        <B>MIRA, our AI tutor</B> — Plus (₹799/month) and Pro (₹1,499/month) subscriptions, a one-day
                        day-pass (₹99), a one-time build pack (₹4,999), and question/credit top-ups.
                    </li>
                </ul>
                <p style={P}>
                    All prices exclude 18% GST. Refund eligibility differs by product type, as set out below. Where this
                    policy grants a refund, it is processed to your original payment method via PayU.
                </p>
            </LegalSection>

            <LegalSection id="course-subscriptions" title="2. Course subscriptions">
                <ul style={UL}>
                    <li style={LI}>
                        <B>7-day money-back guarantee (first purchase).</B> If this is your first purchase of a given course
                        plan (monthly or annual), you may request a full refund within <B>7 days</B> of payment, provided you
                        have consumed less than <B>20%</B> of the course content (measured by lessons marked complete and
                        problems submitted under that plan).
                    </li>
                    <li style={LI}>
                        After 7 days, or once 20% or more of the content has been consumed, the purchase is non-refundable;
                        you can still cancel auto-renewal at any time and keep access until the end of the paid period.
                    </li>
                    <li style={LI}>
                        Annual plans are treated the same way: a full refund within the first 7 days if under the 20%
                        threshold; thereafter no pro-rated refunds for the unused portion of the year.
                    </li>
                </ul>
            </LegalSection>

            <LegalSection id="renewals" title="3. Renewal charges">
                <p style={P}>
                    If a subscription auto-renews and you didn't intend it to, we will refund the renewal charge in full
                    provided that:
                </p>
                <ul style={UL}>
                    <li style={LI}>you contact us within <B>48 hours</B> of the renewal charge, and</li>
                    <li style={LI}>the renewed period is <B>unused</B> — no lessons completed, problems submitted or MIRA questions consumed after the renewal date.</li>
                </ul>
                <p style={P}>
                    The subscription is cancelled at the same time. To avoid unwanted renewals, you can switch off
                    auto-renewal any time before your billing date.
                </p>
            </LegalSection>

            <LegalSection id="mira" title="4. MIRA plans and day-passes">
                <ul style={UL}>
                    <li style={LI}>
                        <B>Day-pass (₹99).</B> Non-refundable once activated — activation starts the 24-hour window and
                        allocates your 40 questions. A day-pass purchased but <B>never activated</B> is refundable within 7
                        days of purchase.
                    </li>
                    <li style={LI}>
                        <B>MIRA Plus and Pro subscriptions.</B> First-time purchases follow the same 7-day money-back rule as
                        courses, with the usage threshold applied to your monthly question allowance: a full refund within 7
                        days if you have used fewer than <B>20%</B> of the period's questions and none of its build credits.
                    </li>
                    <li style={LI}>
                        <B>Pro-rated refunds.</B> If we materially degrade or discontinue a paid MIRA feature mid-period, you
                        may request a pro-rated refund for the unused remainder of that billing period. Pro-rated refunds are
                        not available for ordinary cancellations — cancelling stops renewal and keeps access until the period ends.
                    </li>
                </ul>
            </LegalSection>

            <LegalSection id="topups" title="5. Top-ups and build packs">
                <ul style={UL}>
                    <li style={LI}>
                        Question top-ups (₹399 / 250 questions), credit top-ups (₹699 / 100 build credits) and the build pack
                        (₹4,999 / 700 build credits) are <B>non-refundable once any of the purchased questions or credits have
                        been consumed</B>.
                    </li>
                    <li style={LI}>
                        A top-up or build pack that is entirely unused is refundable within 7 days of purchase.
                    </li>
                    <li style={LI}>Unused questions and credits have no cash value and cannot be exchanged or transferred.</li>
                </ul>
            </LegalSection>

            <LegalSection id="how-to-request" title="6. How to request a refund">
                <ul style={UL}>
                    <li style={LI}>
                        Email <A href="mailto:support@marevlo.com">support@marevlo.com</A> from the email address on your
                        Marevlo account with the subject line &ldquo;Refund request&rdquo;.
                    </li>
                    <li style={LI}>
                        Include your <B>order ID</B> (from your payment confirmation email or receipt), the plan purchased,
                        and a brief reason — it helps us improve.
                    </li>
                    <li style={LI}>We respond within 2 business days with a decision under this policy.</li>
                    <li style={LI}>
                        Approved refunds are issued to your <B>original payment method via PayU</B> and typically arrive
                        within <B>5–7 business days</B>, depending on your bank or card issuer.
                    </li>
                </ul>
            </LegalSection>

            <LegalSection id="gst" title="7. GST treatment">
                <p style={P}>
                    Listed prices exclude GST (currently 18%), which is added at checkout. When a refund is approved, the
                    refund amount includes the GST you paid on the refunded portion, and we issue a corresponding credit note
                    in line with Indian GST rules.
                </p>
            </LegalSection>

            <LegalSection id="exceptions" title="8. Exceptions">
                <p style={P}>We may decline a refund that would otherwise qualify where we find:</p>
                <ul style={UL}>
                    <li style={LI}><B>Fraud or chargeback abuse</B> — including refund requests on payments already disputed with your bank.</li>
                    <li style={LI}><B>Policy abuse</B> — repeated purchase-and-refund cycles of the same plan, account sharing, or bulk content consumption followed by a refund request.</li>
                    <li style={LI}><B>Terms violations</B> — accounts terminated for violating our <Link to="/legal/terms" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>Terms of Service</Link> (for example scraping course content) are not eligible for refunds.</li>
                </ul>
                <p style={P}>
                    Nothing in this policy limits any non-waivable rights you have under Indian consumer-protection law.
                </p>
            </LegalSection>

            <LegalSection id="contact" title="9. Contact">
                <p style={{ margin: 0 }}>
                    Unsure whether your purchase qualifies? Ask us first —{' '}
                    <A href="mailto:support@marevlo.com">support@marevlo.com</A>. We'd rather help you choose the right plan
                    than process a refund.
                </p>
            </LegalSection>
        </LegalShell>
    );
}
