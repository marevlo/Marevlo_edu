import React, { useState } from 'react';
import { Tag } from 'lucide-react';
import { useToast } from '../components/Toast';

/*
 * Plans & Pricing page.
 *
 * Redesigned to match the Marevlo design system: indigo → cyan → violet brand
 * gradient, dark glowing hero (like the Courses / About heroes), and theme
 * tokens (--card, --foreground, --muted-foreground, --primary, --secondary) so
 * the whole page adapts automatically to light and dark mode. All styles are
 * scoped under `.mv-plan` so nothing leaks into the rest of the app.
 *
 * Content (plans, prices, copy, SKUs) is intentionally unchanged.
 */

const CHECK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m5 12 5 5 9-10' fill='none' stroke='%23000' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const CSS = `
.mv-plan{
  --mv-line: rgba(15,23,42,.09);
  --mv-line-strong: rgba(15,23,42,.16);
  --mv-shadow: 0 1px 2px rgba(15,23,42,.04), 0 14px 34px -16px rgba(15,23,42,.20);
  --mv-shadow-lift: 0 2px 6px rgba(15,23,42,.06), 0 28px 60px -22px rgba(79,70,229,.30);

  font-family: var(--font-sans, "DM Sans", system-ui, sans-serif);
  color: var(--foreground);
  background: var(--background);
  min-height: 100%; width: 100%;
  padding-bottom: 76px;
  line-height: 1.5; -webkit-font-smoothing: antialiased;
}
.dark .mv-plan{
  --mv-line: rgba(255,255,255,.09);
  --mv-line-strong: rgba(255,255,255,.16);
  --mv-shadow: 0 1px 2px rgba(0,0,0,.3), 0 14px 34px -16px rgba(0,0,0,.55);
  --mv-shadow-lift: 0 2px 6px rgba(0,0,0,.4), 0 28px 60px -22px rgba(0,0,0,.65);
}
.mv-plan *{box-sizing:border-box;margin:0;padding:0}
.mv-plan .wrap{max-width:1120px;margin:0 auto;padding:0 24px}

/* ── hero (matches Courses / Problems: white card → dark bg, grid backdrop) ── */
.mv-plan .mv-hero{position:relative;overflow:hidden;min-height:300px;padding:48px 24px 44px;
  background:var(--card);border-bottom:1px solid rgba(15,23,42,.07)}
.dark .mv-plan .mv-hero{background:var(--background);border-bottom-color:rgba(255,255,255,.06)}
.mv-plan .mv-hero .grid-bg{position:absolute;inset:0;pointer-events:none;
  background-image:linear-gradient(rgba(148,163,184,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.05) 1px,transparent 1px);
  background-size:44px 44px;
  -webkit-mask-image:radial-gradient(circle at center,#000 20%,transparent 90%);
  mask-image:radial-gradient(circle at center,#000 20%,transparent 90%)}
.mv-plan .mv-hero-inner{position:relative;z-index:1;max-width:896px;margin:0 auto;text-align:center}

.mv-plan .eyebrow{display:inline-flex;align-items:center;gap:7px;margin-bottom:20px;padding:5px 14px;border-radius:999px;
  backdrop-filter:blur(8px);background:rgba(15,23,42,.04);border:1px solid rgba(15,23,42,.08);
  font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#64748b}
.dark .mv-plan .eyebrow{background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.09);color:rgba(255,255,255,.5)}

.mv-plan h1{font-weight:900;font-size:clamp(2.5rem,5.5vw,3.75rem);letter-spacing:-.03em;line-height:1.05;margin:0 0 14px;
  background:linear-gradient(135deg,#1e1b4b 0%,#3730a3 35%,#0369a1 65%,#6672e0 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
.dark .mv-plan h1{background:linear-gradient(135deg,#fff 0%,#e0e7ff 35%,#a5f3fc 65%,#98a0ed 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.mv-plan h1 em{font-style:normal}
.mv-plan .lede{margin:0 auto;max-width:520px;font-size:.95rem;line-height:1.7;color:#475569}
.dark .mv-plan .lede{color:rgba(255,255,255,.62)}

/* ── billing toggle (theme-aware) ──────────────────────────── */
.mv-plan .toggle{display:inline-flex;align-items:center;margin:26px auto 0;position:relative;
  background:var(--muted);border:1px solid var(--mv-line);border-radius:999px;padding:5px}
.mv-plan .toggle button{position:relative;z-index:2;border:0;background:transparent;cursor:pointer;font-family:inherit;
  font-weight:600;font-size:14px;color:var(--muted-foreground);padding:9px 22px;border-radius:999px;transition:color .25s}
.mv-plan .toggle button.active{color:#fff}
.mv-plan .toggle .slider{position:absolute;z-index:1;top:5px;bottom:5px;left:5px;width:calc(50% - 5px);
  background:linear-gradient(135deg,#6672e0,#3fa9c9);border-radius:999px;box-shadow:0 6px 18px -8px rgba(63,169,201,.55);
  transition:transform .32s cubic-bezier(.65,.05,.36,1)}
.mv-plan.is-annual .toggle .slider{transform:translateX(100%)}
.mv-plan .save-row{min-height:22px;margin-top:14px}
.mv-plan .save-tag{display:none;font-size:12px;font-weight:600;color:var(--secondary);
  background:color-mix(in srgb,var(--secondary) 14%,transparent);border:1px solid color-mix(in srgb,var(--secondary) 32%,transparent);
  border-radius:999px;padding:5px 12px}
.mv-plan.is-annual .save-tag.annual-only{display:inline-block}

/* ── section heads ──────────────────────────── */
.mv-plan section{margin-top:56px}
.mv-plan .sec-head{display:flex;align-items:baseline;gap:14px;margin-bottom:24px;padding-bottom:14px;border-bottom:1px solid var(--mv-line)}
.mv-plan .sec-head .num{font-weight:800;font-size:15px;color:var(--primary);font-variant-numeric:tabular-nums}
.mv-plan .sec-head h2{font-weight:800;font-size:24px;letter-spacing:-.02em;color:var(--foreground)}
.mv-plan .sec-head .note{margin-left:auto;font-size:13.5px;color:var(--muted-foreground);text-align:right}

/* ── card grid ──────────────────────────── */
.mv-plan .grid{display:grid;gap:18px}
.mv-plan .grid.cols-2{grid-template-columns:repeat(2,1fr)}
.mv-plan .grid.cols-4{grid-template-columns:repeat(4,1fr)}

.mv-plan .card{position:relative;display:flex;flex-direction:column;background:var(--card);
  border:1px solid var(--mv-line);border-radius:18px;padding:26px 24px;box-shadow:var(--mv-shadow);
  transition:transform .26s ease,box-shadow .26s ease,border-color .26s ease}
.mv-plan .card:hover{transform:translateY(-5px);box-shadow:var(--mv-shadow-lift);
  border-color:color-mix(in srgb,var(--primary) 35%,transparent)}
.mv-plan .card .tier{font-weight:700;font-size:15px;letter-spacing:.01em;color:var(--foreground)}
.mv-plan .card .blurb{color:var(--muted-foreground);font-size:13.5px;margin-top:5px;min-height:38px;line-height:1.5}
.mv-plan .price{margin:18px 0 4px;display:flex;align-items:flex-end;gap:3px}
.mv-plan .price .cur{font-size:20px;font-weight:600;color:var(--muted-foreground);transform:translateY(-13px)}
.mv-plan .price .amt{font-size:46px;font-weight:800;line-height:.9;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:var(--foreground)}
.mv-plan .sub{font-size:13px;color:var(--muted-foreground);min-height:34px}
.mv-plan .feat{list-style:none;margin:20px 0 22px;display:flex;flex-direction:column;gap:11px;flex:1}
.mv-plan .feat li{font-size:14px;color:var(--foreground);position:relative;padding-left:28px;line-height:1.45}
.mv-plan .feat li::before{content:"";position:absolute;left:0;top:1px;width:18px;height:18px;border-radius:50%;
  background:color-mix(in srgb,var(--primary) 14%,transparent)}
.mv-plan .feat li::after{content:"";position:absolute;left:4.5px;top:5.5px;width:9px;height:9px;background:var(--primary);
  -webkit-mask:url("${CHECK}") center/contain no-repeat;mask:url("${CHECK}") center/contain no-repeat}

.mv-plan .cta{display:block;width:100%;text-align:center;font-family:inherit;font-weight:700;font-size:14.5px;
  padding:13px 16px;border-radius:12px;cursor:pointer;border:1px solid var(--mv-line-strong);background:transparent;
  color:var(--foreground);transition:background .2s,color .2s,border-color .2s,transform .1s,box-shadow .2s}
.mv-plan .cta:hover{border-color:color-mix(in srgb,var(--primary) 55%,transparent);
  background:color-mix(in srgb,var(--primary) 8%,transparent);color:var(--primary)}
.mv-plan .cta:active{transform:scale(.985)}
.mv-plan .cta.solid{background:linear-gradient(135deg,var(--primary),var(--secondary));border-color:transparent;color:#fff;
  box-shadow:0 12px 26px -12px color-mix(in srgb,var(--primary) 85%,transparent)}
.mv-plan .cta.solid:hover{filter:brightness(1.06);color:#fff;transform:translateY(-1px)}
.mv-plan .topup-tag{font-size:12px;color:var(--primary);font-weight:600;margin-top:12px}

/* ── featured card (gradient ring) ──────────────────────────── */
.mv-plan .card.featured{border:1.5px solid transparent;
  background:linear-gradient(var(--card),var(--card)) padding-box,
            linear-gradient(135deg,var(--primary),var(--secondary)) border-box;
  box-shadow:0 22px 52px -22px color-mix(in srgb,var(--primary) 55%,transparent),var(--mv-shadow)}
.mv-plan .card.featured:hover{transform:translateY(-5px);
  box-shadow:0 28px 64px -22px color-mix(in srgb,var(--primary) 65%,transparent)}
.mv-plan .badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);
  background:linear-gradient(135deg,#6672e0,#3fa9c9);color:#fff;font-size:11px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;padding:5px 13px;border-radius:999px;white-space:nowrap;box-shadow:0 8px 20px -8px rgba(63,169,201,.7)}
.mv-plan .annual-only{display:none}
.mv-plan.is-annual .annual-only{display:inline-block}

/* ── build pack (dark feature panel, both modes) ──────────────────────────── */
.mv-plan .pack{position:relative;overflow:hidden;display:grid;grid-template-columns:1.4fr 1fr;border-radius:20px;
  background:linear-gradient(135deg,#0d1030 0%,#101535 48%,#0a1c2e 100%);color:#fff;
  box-shadow:0 30px 70px -32px rgba(63,169,201,.45),0 12px 32px -22px rgba(0,0,0,.6)}
.mv-plan .pack .pglow{position:absolute;border-radius:50%;filter:blur(72px);pointer-events:none}
.mv-plan .pack .pglow.a{top:-110px;left:-60px;width:300px;height:300px;background:radial-gradient(circle,rgba(102,114,224,.5),transparent 65%)}
.mv-plan .pack .pglow.b{bottom:-130px;right:-50px;width:320px;height:320px;background:radial-gradient(circle,rgba(63,169,201,.42),transparent 65%)}
.mv-plan .pack .left{position:relative;z-index:1;padding:36px 34px}
.mv-plan .pack .kicker{font-size:12px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#8ed3e3}
.mv-plan .pack h3{font-weight:800;font-size:30px;margin:10px 0 10px;letter-spacing:-.02em;color:#fff}
.mv-plan .pack p{color:rgba(255,255,255,.66);font-size:14.5px;max-width:46ch;line-height:1.6}
.mv-plan .pack .right{position:relative;z-index:1;padding:36px 34px;background:rgba(255,255,255,.04);
  border-left:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;justify-content:center}
.mv-plan .pack .right .price .cur{color:rgba(255,255,255,.8)}
.mv-plan .pack .right .price .amt{color:#fff}
.mv-plan .pack .right .sub{color:rgba(255,255,255,.6)}
.mv-plan .pack .cta{margin-top:18px;border-color:rgba(255,255,255,.25);color:#fff;background:rgba(255,255,255,.05)}
.mv-plan .pack .cta:hover{background:#fff;color:#0d1030;border-color:#fff;filter:none}

/* ── top-ups ──────────────────────────── */
.mv-plan .topups{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
.mv-plan .topup{display:flex;align-items:center;justify-content:space-between;gap:16px;
  background:color-mix(in srgb,var(--primary) 4%,var(--card));border:1px dashed var(--mv-line-strong);
  border-radius:16px;padding:22px 24px;transition:border-color .2s,background .2s}
.mv-plan .topup:hover{border-color:color-mix(in srgb,var(--primary) 45%,transparent)}
.mv-plan .topup .info .t{font-weight:700;font-size:15px;color:var(--foreground)}
.mv-plan .topup .info .d{color:var(--muted-foreground);font-size:13.5px;margin-top:3px}
.mv-plan .topup .buy{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.mv-plan .topup .buy .p{font-weight:800;font-size:24px;color:var(--foreground)}
.mv-plan .topup .buy button{font-family:inherit;background:transparent;border:0;cursor:pointer;font-size:13px;font-weight:700;
  color:var(--primary);border-bottom:1px solid color-mix(in srgb,var(--primary) 30%,transparent);padding:0 0 2px;transition:border-color .2s}
.mv-plan .topup .buy button:hover{border-color:var(--primary)}

/* ── footer ──────────────────────────── */
.mv-plan footer{margin-top:52px;text-align:center;color:var(--muted-foreground);font-size:13.5px;line-height:1.7}
.mv-plan footer .pay{display:inline-flex;align-items:center;gap:7px;font-weight:600;color:var(--foreground);margin-top:8px}
.mv-plan footer .pay svg{color:var(--secondary)}

/* ── motion ──────────────────────────── */
.mv-plan .reveal{opacity:0;transform:translateY(14px);animation:mvRise .7s cubic-bezier(.2,.7,.2,1) forwards}
@keyframes mvRise{to{opacity:1;transform:none}}

@media(max-width:880px){
  .mv-plan .grid.cols-4{grid-template-columns:repeat(2,1fr)}
  .mv-plan .pack{grid-template-columns:1fr}
  .mv-plan .pack .right{border-left:0;border-top:1px solid rgba(255,255,255,.1)}
  .mv-plan .sec-head .note{display:none}
}
@media(max-width:560px){
  .mv-plan .grid.cols-2,.mv-plan .grid.cols-4,.mv-plan .topups{grid-template-columns:1fr}
}
@media (prefers-reduced-motion: reduce){
  .mv-plan .reveal{animation:none;opacity:1;transform:none}
  .mv-plan .toggle .slider{transition:none}
}
`;

export default function Plan() {
    const [annual, setAnnual] = useState(false);
    const showToast = useToast();

    // Wire this to the PayU checkout. `sku` matches the backend entitlement
    // product / order item; `period` follows the billing toggle. Example:
    //   window.location.href = `/checkout?sku=${sku}&period=${period}`;
    const selectPlan = (sku) => {
        const period = annual ? 'yearly' : 'monthly';
        showToast(`Selected ${sku} (${period}) — checkout coming soon`, 'info');
    };

    return (
        <div className={`mv-plan${annual ? ' is-annual' : ''}`}>
            <style>{CSS}</style>

            {/* ———————— HERO ———————— */}
            <header className="mv-hero">
                <div className="grid-bg" aria-hidden="true" />
                <div className="mv-hero-inner">
                    <div className="eyebrow reveal" style={{ animationDelay: '.05s' }}>
                        <Tag size={11} style={{ color: '#3fa9c9' }} />
                        Plans &amp; Pricing
                    </div>
                    <h1 className="reveal" style={{ animationDelay: '.12s' }}>Learn the craft.<br /><em>Build</em> with MIRA.</h1>
                    <p className="lede reveal" style={{ animationDelay: '.2s' }}>Courses unlock the curriculum. MIRA — your AI tutor — is a separate add-on you can pick up whenever you want. Mix and match.</p>

                    <div className="toggle reveal" role="tablist" aria-label="Billing period" style={{ animationDelay: '.28s' }}>
                        <span className="slider" aria-hidden="true" />
                        <button
                            className={annual ? '' : 'active'}
                            role="tab"
                            aria-selected={!annual}
                            onClick={() => setAnnual(false)}
                        >Monthly</button>
                        <button
                            className={annual ? 'active' : ''}
                            role="tab"
                            aria-selected={annual}
                            onClick={() => setAnnual(true)}
                        >Annual</button>
                    </div>
                    <div className="save-row reveal" style={{ animationDelay: '.28s' }}>
                        <span className="save-tag annual-only">Annual = up to 2 months free</span>
                    </div>
                </div>
            </header>

            <div className="wrap">

                {/* ———————— COURSES ———————— */}
                <section className="reveal" style={{ animationDelay: '.1s' }}>
                    <div className="sec-head">
                        <span className="num">01</span>
                        <h2>Courses</h2>
                        <span className="note">Full curriculum access · coding workspace included</span>
                    </div>
                    <div className="grid cols-2">

                        <div className="card">
                            <div className="tier">DSA</div>
                            <div className="blurb">Data Structures &amp; Algorithms — interview-ready, end to end.</div>
                            <div className="price"><span className="cur">₹</span><span className="amt">{annual ? '1,399' : '1,999'}</span></div>
                            <div className="sub">{annual ? '/mo · billed ₹16,788/yr + GST' : 'per month + GST'}</div>
                            <ul className="feat">
                                <li>All DSA modules &amp; structured tracks</li>
                                <li>Curated problem practice</li>
                                <li>In-browser coding workspace (JupyterHub)</li>
                                <li>Progress tracking</li>
                            </ul>
                            <button type="button" className="cta" onClick={() => selectPlan('course_dsa')}>Choose DSA</button>
                        </div>

                        <div className="card">
                            <div className="tier">Data Science + DSA</div>
                            <div className="blurb">The full combination — data science and algorithms together.</div>
                            <div className="price"><span className="cur">₹</span><span className="amt">{annual ? '2,299' : '2,999'}</span></div>
                            <div className="sub">{annual ? '/mo · billed ₹27,588/yr + GST' : 'per month + GST'}</div>
                            <ul className="feat">
                                <li>Everything in DSA</li>
                                <li>Complete Data Science track</li>
                                <li>Hands-on projects &amp; notebooks</li>
                                <li>Progress tracking</li>
                            </ul>
                            <button type="button" className="cta solid" onClick={() => selectPlan('course_ds_dsa')}>Choose DS + DSA</button>
                        </div>

                    </div>
                </section>

                {/* ———————— MIRA ———————— */}
                <section>
                    <div className="sec-head">
                        <span className="num">02</span>
                        <h2>MIRA — your AI tutor</h2>
                        <span className="note">Adaptive tutoring · paid separately from courses</span>
                    </div>
                    <div className="grid cols-4">

                        <div className="card">
                            <div className="tier">Free</div>
                            <div className="blurb">Try the tutor, no commitment.</div>
                            <div className="price"><span className="cur">₹</span><span className="amt">0</span></div>
                            <div className="sub">forever</div>
                            <ul className="feat">
                                <li>~15 questions / week</li>
                                <li>Full paced walkthroughs</li>
                                <li>Remembers what you know</li>
                            </ul>
                            <button type="button" className="cta" onClick={() => selectPlan('mira_free')}>Start free</button>
                        </div>

                        <div className="card">
                            <div className="tier">Day-pass</div>
                            <div className="blurb">A focused day of help before a test or deadline.</div>
                            <div className="price"><span className="cur">₹</span><span className="amt">99</span></div>
                            <div className="sub">one day · 40 questions</div>
                            <ul className="feat">
                                <li>40 questions for 24 hours</li>
                                <li>Full walkthrough format</li>
                                <li>No subscription</li>
                            </ul>
                            <button type="button" className="cta" onClick={() => selectPlan('mira_day')}>Get a day-pass</button>
                        </div>

                        <div className="card featured">
                            <span className="badge">Most popular</span>
                            <div className="tier">Plus</div>
                            <div className="blurb">For steady, everyday learning.</div>
                            <div className="price"><span className="cur">₹</span><span className="amt">{annual ? '666' : '799'}</span></div>
                            <div className="sub">{annual ? '/mo · billed ₹7,990/yr + GST' : 'per month + GST'}</div>
                            <ul className="feat">
                                <li>500 questions / month</li>
                                <li>Walkthroughs + memory + history</li>
                                <li>50 build credits / month</li>
                            </ul>
                            <button type="button" className="cta solid" onClick={() => selectPlan('mira_plus')}>Get Plus</button>
                            <div className="topup-tag">↑ Top up questions anytime</div>
                        </div>

                        <div className="card">
                            <div className="tier">Pro</div>
                            <div className="blurb">Heavier learning + more building room.</div>
                            <div className="price"><span className="cur">₹</span><span className="amt">{annual ? '1,249' : '1,499'}</span></div>
                            <div className="sub">{annual ? '/mo · billed ₹14,990/yr + GST' : 'per month + GST'}</div>
                            <ul className="feat">
                                <li>1,250 questions / month</li>
                                <li>Everything in Plus</li>
                                <li>150 build credits / month</li>
                                <li>More premium-model time</li>
                            </ul>
                            <button type="button" className="cta solid" onClick={() => selectPlan('mira_pro')}>Get Pro</button>
                            <div className="topup-tag">↑ Top up questions anytime</div>
                        </div>

                    </div>
                </section>

                {/* ———————— BUILD PACK ———————— */}
                <section>
                    <div className="sec-head">
                        <span className="num">03</span>
                        <h2>Building something big?</h2>
                        <span className="note">For heavy use — apps, projects, agents</span>
                    </div>
                    <div className="pack">
                        <span className="pglow a" aria-hidden="true" />
                        <span className="pglow b" aria-hidden="true" />
                        <div className="left">
                            <div className="kicker">Build credit pack</div>
                            <h3>700 build credits</h3>
                            <p>Build credits power MIRA's heavy work — generating and debugging full projects, scaffolding apps, longer coding sessions. Made for builders who push hard. Stacks on any plan, and you can top up credits whenever you run low.</p>
                        </div>
                        <div className="right">
                            <div className="price"><span className="cur">₹</span><span className="amt">4,999</span></div>
                            <div className="sub">one-time · 700 build credits + GST</div>
                            <button type="button" className="cta" onClick={() => selectPlan('build_pack_700')}>Buy the build pack</button>
                        </div>
                    </div>
                </section>

                {/* ———————— TOP-UPS ———————— */}
                <section>
                    <div className="sec-head">
                        <span className="num">04</span>
                        <h2>Top-ups</h2>
                        <span className="note">Run low mid-month? Add more without upgrading.</span>
                    </div>
                    <div className="topups">
                        <div className="topup">
                            <div className="info">
                                <div className="t">+ 250 questions</div>
                                <div className="d">For Plus &amp; Pro plans · added instantly</div>
                            </div>
                            <div className="buy">
                                <span className="p">₹399</span>
                                <button type="button" onClick={() => selectPlan('topup_questions_250')}>Add questions →</button>
                            </div>
                        </div>
                        <div className="topup">
                            <div className="info">
                                <div className="t">+ 100 build credits</div>
                                <div className="d">For the build pack &amp; heavy builders</div>
                            </div>
                            <div className="buy">
                                <span className="p">₹699</span>
                                <button type="button" onClick={() => selectPlan('topup_credits_100')}>Add credits →</button>
                            </div>
                        </div>
                    </div>
                </section>

                <footer>
                    All prices exclude 18% GST. Courses and MIRA are billed separately.<br />
                    <span className="pay">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 2 4 5v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V5l-8-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        Secure payments via PayU
                    </span>
                </footer>

            </div>
        </div>
    );
}

