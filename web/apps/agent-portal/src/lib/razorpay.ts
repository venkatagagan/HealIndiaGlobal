import type { CheckoutOut, RazorpayVerifyIn } from '@hig/shared/api';

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void): void;
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loader: Promise<RazorpayConstructor> | null = null;

export function loadRazorpay(): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loader) return loader;
  loader = new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error('Razorpay Checkout failed to initialise.'));
    };
    script.onerror = () => {
      loader = null;
      script.remove();
      reject(new Error('Could not load Razorpay Checkout. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return loader;
}

/**
 * Opens Razorpay Checkout for an order created by POST /payments/orders. Resolves with the handler payload
 * (to be verified server-side), rejects when the payment fails or the dialog is dismissed.
 */
export async function openRazorpayCheckout(checkout: CheckoutOut): Promise<RazorpayVerifyIn> {
  const rz = checkout.razorpay;
  if (!rz) throw new Error('This order has no Razorpay checkout details.');
  const Razorpay = await loadRazorpay();
  return new Promise<RazorpayVerifyIn>((resolve, reject) => {
    const instance = new Razorpay({
      key: rz.key_id,
      order_id: rz.order_id,
      amount: rz.amount,
      currency: rz.currency,
      name: rz.name,
      description: rz.description,
      prefill: rz.prefill,
      theme: { color: '#22C55E' },
      handler: (response: RazorpayVerifyIn) => resolve(response),
      modal: { ondismiss: () => reject(new Error('Payment window closed before completion.')) },
    });
    instance.on('payment.failed', (response) =>
      reject(new Error(response.error?.description ?? 'Payment failed. Please try another method.')),
    );
    instance.open();
  });
}
