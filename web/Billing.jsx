import React from 'react';
import { ArrowRight, CreditCard, TriangleAlert } from 'lucide-react';
import './Billing.css';

const when = value => value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const daysLeft = value => Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 86400_000));
export function planState(billing) {
  if (!billing?.enabled) return null;
  if (!billing.entitled) return { level: 'blocked', title: 'Capture is paused', message: billing.reason === 'trial_ended' ? 'Your free trial has ended. Start a subscription to keep capturing new messages. Your archive is safe.' : 'Your subscription is not active. Renew it to continue capturing new messages. Your archive is safe.' };
  if (billing.reason === 'past_due') return { level: 'warn', title: 'Payment needs attention', message: 'Your latest payment did not go through. Update your payment method to avoid an interruption.' };
  if (billing.reason === 'trial') { const days = daysLeft(billing.trialEndsAt); return days <= 3 ? { level: 'warn', title: days ? `${days} day${days === 1 ? '' : 's'} left in your trial` : 'Your trial ends today', message: 'Start a subscription now and you will not be charged until the trial ends.' } : { level: 'info', title: `${days} days left in your free trial`, message: '' }; }
  if (billing.cancelAtPeriodEnd) return { level: 'warn', title: 'Subscription ending', message: `Capture continues until ${when(billing.periodEnd)}. Reactivate any time from Manage billing.` };
  return { level: 'ok', title: 'Subscription active', message: '' };
}
export function PlanBanner({ billing, onManage }) {
  const state = planState(billing);
  if (!state || state.level === 'ok' || state.level === 'info') return null;
  return <div className={`plan-banner ${state.level === 'blocked' ? 'blocked' : ''}`} role="status">
    {state.level === 'blocked' ? <TriangleAlert size={20}/> : <CreditCard size={20}/>}<div><strong>{state.title}</strong><p>{state.message}</p></div>
    <button className="button secondary compact" onClick={onManage}>{state.level === 'blocked' ? 'Choose a plan' : 'Manage plan'}<ArrowRight size={14}/></button>
  </div>;
}
export function PlanCard({ billing, isDemo, busy, onCheckout, onPortal, onSignIn }) {
  if (isDemo && !billing?.enabled) return null;
  if (isDemo) return <section className="settings-card"><div className="section-icon"><CreditCard size={20}/></div><h2>Your plan</h2><p>{billing?.enabled ? `New accounts start with a ${billing.trialDays}-day free trial. No card is needed to try undelete.chat.` : 'Sign in to view your plan.'}</p><button className="button secondary" onClick={onSignIn}>Sign in<ArrowRight size={16}/></button></section>;
  if (!billing?.enabled) return null;
  const state = planState(billing), subscribed = ['active', 'trialing', 'past_due'].includes(billing.status);
  const statusLabel = billing.reason === 'exempt' ? 'Operator account' : billing.reason === 'trial' ? 'Free trial' : billing.status === 'active' ? 'Active' : billing.status === 'trialing' ? 'Trial (card on file)' : billing.status === 'past_due' ? 'Payment past due' : billing.reason === 'trial_ended' ? 'Trial ended' : billing.status === 'canceled' ? 'Cancelled' : 'Inactive';
  return <section className={`settings-card ${state?.level === 'blocked' ? 'attention' : ''}`}>
    <div className="section-icon"><CreditCard size={20}/></div><h2>Your plan</h2>
    <span className={`plan-status ${state?.level === 'blocked' ? 'attention' : state?.level === 'warn' ? 'warn' : ''}`}>{statusLabel}</span>
    <p>{state?.message || 'Your subscription keeps hosted capture running for every connected account. Your archive stays available to read and export even without an active plan.'}</p>
    <ul className="plan-facts">
      {billing.reason === 'trial' && <li><span>Trial ends</span><span>{when(billing.trialEndsAt)}</span></li>}
      {billing.periodEnd && subscribed && <li><span>{billing.cancelAtPeriodEnd ? 'Access ends' : 'Next renewal'}</span><span>{when(billing.periodEnd)}</span></li>}
      <li><span>Capture</span><span>{billing.entitled ? 'Enabled' : 'Paused'}</span></li>
    </ul>
    <div className="plan-actions">
      {billing.reason !== 'exempt' && !subscribed && <button className="button primary" disabled={busy} onClick={onCheckout}>{billing.reason === 'trial' ? 'Add payment method' : 'Start subscription'}<ArrowRight size={16}/></button>}
      {billing.reason !== 'exempt' && billing.customer && <button className="button secondary" disabled={busy} onClick={onPortal}>Manage billing<ArrowRight size={16}/></button>}
    </div>
    <a className="card-guide-link" href="/docs/billing">Plans, trials, and cancellation<ArrowRight size={13}/></a>
  </section>;
}
