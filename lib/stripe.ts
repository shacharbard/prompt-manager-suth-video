// lib/stripe.ts
import { MembershipStatus } from "@/hooks/use-membership"; // We'll create this hook later
import Stripe from "stripe";

// Ensure Stripe Secret Key environment variable is set
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY environment variable is not set.");
}

// Initialize the Stripe client with the secret key and API version
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-03-31.basil", // Use the latest API version or your preferred one
  appInfo: {
    // Optional: Helps Stripe identify traffic from your app
    name: "Prompt Manager",
    version: "0.1.0"
  }
});

// Helper function to map Stripe subscription statuses to our internal MembershipStatus
export const getMembershipStatusFromSubscription = (status: Stripe.Subscription.Status): MembershipStatus => {
  switch (status) {
    case "active":
    case "trialing":
      // Active or trialing subscriptions grant "pro" status
      return "pro";
    case "canceled": // Often means active until period end, might need refinement
    case "incomplete":
    case "incomplete_expired":
    case "past_due":
    case "paused":
    case "unpaid":
      // All other non-active/problematic statuses revert to "free"
      return "free";
    default:
      // Default to "free" for safety
      return "free";
  }
};
