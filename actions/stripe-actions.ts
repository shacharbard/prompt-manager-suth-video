// actions/stripe-actions.ts
"use server";

import {
  createCustomerAction,
  getCustomerByUserIdAction,
  updateCustomerByStripeCustomerIdAction,
  updateCustomerByUserIdAction // Ensure updateCustomerByUserIdAction is imported if needed elsewhere, maybe not here
} from "@/actions/customers-actions";
import { SelectCustomer } from "@/db/schema/customers-schema";
import { getMembershipStatusFromSubscription, stripe } from "@/lib/stripe";

// Type alias for clarity
export type MembershipStatus = SelectCustomer["membership"];

// Helper to retrieve a subscription - reduces repetition
const getSubscription = async (subscriptionId: string) => {
  try {
    console.log(`Stripe Action: Retrieving subscription ${subscriptionId}`);
    return await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["default_payment_method"] // Optional: expand if you need payment details
    });
  } catch (error) {
    console.error(`Error fetching Stripe subscription ${subscriptionId}:`, error);
    throw new Error("Failed to fetch Stripe subscription");
  }
};

/**
 * Handles subscription changes (updates, cancellations) from webhooks.
 * Fetches the subscription from Stripe to get the latest status,
 * then updates the corresponding customer record in our database.
 * @param subscriptionId - The Stripe Subscription ID.
 * @param customerId - The Stripe Customer ID.
 */
export const manageSubscriptionStatusChange = async (subscriptionId: string, customerId: string): Promise<void> => {
  try {
    console.log(`Stripe Action: Managing status change for sub ${subscriptionId}, cust ${customerId}`);
    if (!subscriptionId || !customerId) {
      throw new Error("Missing subscriptionId or customerId for status change management.");
    }

    // Fetch the subscription object from Stripe
    const subscription = await getSubscription(subscriptionId);

    // Determine our internal membership status based on Stripe's status
    const membershipStatus = getMembershipStatusFromSubscription(subscription.status);
    console.log(`Stripe Action: Determined membership status as '${membershipStatus}' for sub ${subscriptionId}`);

    // Update our local customer record based on the Stripe Customer ID
    const updateResult = await updateCustomerByStripeCustomerIdAction(customerId, {
      stripeSubscriptionId: subscription.id, // Store/update the subscription ID
      membership: membershipStatus, // Update membership status
      updatedAt: new Date() // Update timestamp
    });

    // Log success or warning if customer wasn't found (updateCustomerByStripeCustomerIdAction handles not throwing error)
    if (updateResult && updateResult.userId) {
      console.log(`Stripe Action: Successfully updated DB for Stripe customer ${customerId} to status ${membershipStatus}`);
    } else {
      console.warn(`Stripe Action: Update attempted for Stripe customer ${customerId}, but local record not found or update failed.`);
    }
  } catch (error) {
    console.error(`Error in manageSubscriptionStatusChange for sub ${subscriptionId}:`, error);
    // Rethrow a generic error to the webhook handler
    throw new Error("Failed to update subscription status in database.");
  }
};

/**
 * Creates or updates a customer record in our database after a successful Stripe Checkout.
 * This links our internal user ID (from Clerk) with the Stripe customer and subscription IDs.
 * @param userId - Our internal Clerk user ID (passed via client_reference_id).
 * @param customerId - The Stripe Customer ID created/used during checkout.
 * @param subscriptionId - The Stripe Subscription ID created during checkout.
 * @param membershipStatus - The initial membership status derived from the webhook event.
 */
export const upsertStripeCustomer = async (
  userId: string,
  customerId: string, // Stripe Customer ID
  subscriptionId: string,
  membershipStatus: MembershipStatus // Pre-calculated status
): Promise<void> => {
  try {
    console.log(`Stripe Action: Upserting customer for user ${userId}, Stripe cust ${customerId}, sub ${subscriptionId}`);
    if (!userId || !customerId || !subscriptionId || !membershipStatus) {
      throw new Error("Missing required parameters for upsertStripeCustomer.");
    }

    // Check if customer exists in our DB by Clerk userId
    const existingCustomers = await getCustomerByUserIdAction(userId);

    const customerData = {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      membership: membershipStatus,
      updatedAt: new Date()
    };

    if (existingCustomers && existingCustomers.length > 0) {
      // Customer exists - Update using our user ID (safer primary key)
      console.log(`Stripe Action: Updating existing customer record for user ${userId}`);
      await updateCustomerByUserIdAction(userId, customerData); // Use the user ID based update
    } else {
      // Customer doesn't exist - Create new record
      console.log(`Stripe Action: Creating new customer record for user ${userId}`);
      await createCustomerAction({
        userId, // Link to Clerk user
        ...customerData,
        createdAt: new Date() // Set createdAt only on creation
      });
    }
    console.log(`Stripe Action: Successfully upserted customer for user ${userId} with status ${membershipStatus}`);
  } catch (error) {
    console.error(`Error in upsertStripeCustomer for user ${userId}:`, error);
    throw new Error("Failed to create or update customer record from Stripe event.");
  }
};
