/** Razorpay Checkout.js loader + typed `open()` wrapper (cards never touch our servers). */
import type { CheckoutOut, RazorpayVerifyIn } from '@hig/shared/api';

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpayVerifyIn) => void;
  modal?: { ondismiss?: () => void; escape?: boolean; confirm_close?: boolean };
  notes?: Record<string, string>;
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', cb: (response: { error?: { description?: string; reason?: string } }) => void): void;
}

type RazorpayCtor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

let loading: Promise<RazorpayCtor> | null = null;

export function loadRazorpay(): Promise<RazorpayCtor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loading) return loading;
  loading = new Promise<RazorpayCtor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');
    const onLoad = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error('Razorpay Checkout failed to initialise.'));
    };
    const onError = () => {
      loading = null;
      script.remove();
      reject(new Error('Could not load Razorpay Checkout. Check your connection and try again.'));
    };
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
  });
  return loading;
}

export type RazorpayOutcome =
  | { kind: 'success'; response: RazorpayVerifyIn }
  | { kind: 'dismissed' }
  | { kind: 'failed'; message: string };

/** Opens Checkout for a server-created order and resolves with the outcome. */
export async function openRazorpayCheckout(checkout: NonNullable<CheckoutOut['razorpay']>): Promise<RazorpayOutcome> {
  const Razorpay = await loadRazorpay();
  return new Promise<RazorpayOutcome>((resolve) => {
    let settled = false;
    let lastError: string | null = null;
    const settle = (outcome: RazorpayOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const prefill: RazorpayOptions['prefill'] = {};
    if (checkout.prefill.name) prefill.name = checkout.prefill.name;
    if (checkout.prefill.email) prefill.email = checkout.prefill.email;
    if (checkout.prefill.contact) prefill.contact = checkout.prefill.contact;
    const instance = new Razorpay({
      key: checkout.key_id,
      order_id: checkout.order_id,
      amount: checkout.amount,
      currency: checkout.currency,
      name: checkout.name,
      description: checkout.description,
      prefill,
      theme: { color: '#22C55E' },
      handler: (response) => settle({ kind: 'success', response }),
      // Checkout lets the payer retry inside the modal after a failure, so a failure only becomes the
      // outcome when the modal is closed without a later success.
      modal: {
        ondismiss: () => settle(lastError ? { kind: 'failed', message: lastError } : { kind: 'dismissed' }),
        confirm_close: true,
      },
    });
    instance.on('payment.failed', (response) => {
      lastError = response.error?.description ?? 'The payment was declined.';
    });
    instance.open();
  });
}
