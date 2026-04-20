/**
 * Minimal types for the Razorpay events we consume. The official razorpay SDK
 * types are looser than we want — these are the fields we actually read.
 *
 * Reference: https://razorpay.com/docs/webhooks/payloads/
 */

export type RazorpayCustomer = {
  id: string;
  email?: string | null;
  contact?: string | null;
  name?: string | null;
  notes?: Record<string, string>;
  created_at?: number;
};

export type RazorpayPayment = {
  id: string;
  entity: "payment";
  amount: number; // paise
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  order_id?: string | null;
  invoice_id?: string | null;
  international?: boolean;
  method?: string;
  amount_refunded?: number;
  refund_status?: string | null;
  captured?: boolean;
  description?: string | null;
  card_id?: string | null;
  bank?: string | null;
  wallet?: string | null;
  vpa?: string | null;
  email?: string | null;
  contact?: string | null;
  customer_id?: string | null;
  notes?: Record<string, string> | string[];
  fee?: number;
  tax?: number;
  error_code?: string | null;
  error_description?: string | null;
  created_at: number; // unix seconds
  /** Present when payment was made against a subscription */
  subscription_id?: string;
};

export type RazorpaySubscription = {
  id: string;
  entity: "subscription";
  plan_id: string;
  customer_id?: string | null;
  status:
    | "created"
    | "authenticated"
    | "active"
    | "pending"
    | "halted"
    | "cancelled"
    | "completed"
    | "expired";
  current_start?: number | null;
  current_end?: number | null;
  ended_at?: number | null;
  start_at?: number | null;
  end_at?: number | null;
  charge_at?: number | null;
  total_count?: number;
  paid_count?: number;
  remaining_count?: number;
  notes?: Record<string, string>;
  created_at: number;
  /** Plan amount in paise — sometimes available on the subscription event */
  plan?: { item: { amount: number; currency: string; name?: string } };
};

export type RazorpayWebhookEvent = {
  entity: "event";
  account_id: string;
  event: string; // "payment.captured", "subscription.charged", etc.
  contains: string[]; // e.g. ["payment"]
  payload: {
    payment?: { entity: RazorpayPayment };
    subscription?: { entity: RazorpaySubscription };
    customer?: { entity: RazorpayCustomer };
    refund?: { entity: { id: string; payment_id: string; amount: number; created_at: number } };
  };
  created_at: number;
};
