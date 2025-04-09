// app/api/stripe/webhooks/route.ts
import { manageSubscriptionStatusChange, upsertStripeCustomer } from "@/actions/stripe-actions";
import { getMembershipStatusFromSubscription, stripe } from "@/lib/stripe";
import console from "console"; // Using console explicitly for clarity
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server"; // Import NextRequest/Response for edge runtime
import Stripe from "stripe";

// Edge runtime is recommended for webhooks for speed and reliability
// export const runtime = 'edge'; // Uncomment if deploying to Vercel Edge Functions

// Set of relevant webhook events to process
const relevantEvents = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted"
  // Add 'invoice.payment_succeeded' if needed for more granular checks
  // Add 'invoice.payment_failed' to handle payment failures
]);

/**
 * POST handler for receiving Stripe webhook events.
 * Verifies the event signature and processes relevant events.
 */
export async function POST(req: NextRequest) {
  const body = await req.text(); // Read the raw request body
  const sig = (await headers()).get("Stripe-Signature") as string; // Get the signature from headers
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET; // Get secret from environment
  let event: Stripe.Event;

  // 1. Verify the webhook signature
  try {
    if (!sig || !webhookSecret) {
      console.error("Webhook Error: Missing Stripe signature or webhook secret.");
      return new NextResponse("Webhook Error: Configuration missing.", { status: 400 });
    }
    // Use Stripe's library to construct and verify the event
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    console.log(`Webhook received: ${event.id}, Type: ${event.type}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Webhook signature verification failed: ${message}`, err);
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
  }

  // 2. Process only relevant events
  if (relevantEvents.has(event.type)) {
    try {
      console.log(`Processing relevant event: ${event.type}`);
      // Handle different event types
      switch (event.type) {
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          const subscription = event.data.object as Stripe.Subscription;
          console.log(`Handling subscription update/delete for sub: ${subscription.id}`);
          // Call action to update DB based on Stripe subscription status
          await manageSubscriptionStatusChange(subscription.id, subscription.customer as string);
          break;

        case "checkout.session.completed":
          const checkoutSession = event.data.object as Stripe.Checkout.Session;
          console.log(`Handling checkout session completion for session: ${checkoutSession.id}`);
          if (checkoutSession.mode === "subscription") {
            const subscriptionId = checkoutSession.subscription as string;
            const userId = checkoutSession.client_reference_id as string; // Our internal user ID
            const customerId = checkoutSession.customer as string; // Stripe Customer ID

            if (!userId) throw new Error("Missing client_reference_id in checkout session");
            if (!subscriptionId) throw new Error("Missing subscription ID in checkout session");
            if (!customerId) throw new Error("Missing customer ID in checkout session");

            // Fetch the sub to get initial status - Stripe doesn't guarantee it's active immediately
            const newSubscription = await stripe.subscriptions.retrieve(subscriptionId);
            const initialStatus = getMembershipStatusFromSubscription(newSubscription.status);

            console.log(`Upserting customer for user ${userId} with initial status ${initialStatus}`);
            // Create or update customer record in our DB
            await upsertStripeCustomer(userId, customerId, subscriptionId, initialStatus);
          } else {
            console.log(`Ignoring checkout session ${checkoutSession.id} (mode: ${checkoutSession.mode})`);
          }
          break;
        // Add cases for 'invoice.payment_failed', 'invoice.payment_succeeded' etc. if needed

        default:
          // Should not happen due to the relevantEvents check
          console.warn(`Unhandled relevant event type: ${event.type}`);
          throw new Error(`Unhandled relevant event type: ${event.type}`);
      }
      console.log(`Successfully processed event: ${event.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown processing error";
      console.error(`Webhook handler failed for event ${event.type} (${event.id}): ${message}`, error);
      // Return 500 to signal an internal error to Stripe (it might retry)
      return new NextResponse(`Webhook handler failed: ${message}`, { status: 500 });
    }
  } else {
    console.log(`Ignoring irrelevant event type: ${event.type}`);
  }

  // 3. Acknowledge receipt of the event to Stripe
  // Return a 200 OK response to Stripe quickly to prevent retries
  return NextResponse.json({ received: true });
}
