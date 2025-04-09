// actions/customers-actions.ts
"use server"; // Mark as Server Actions

import { db } from "@/db";
import { customers, InsertCustomer, SelectCustomer } from "@/db/schema/customers-schema";
import { eq } from "drizzle-orm";

// Action to create a new customer record
export async function createCustomerAction(data: InsertCustomer): Promise<SelectCustomer> {
  try {
    console.log("Action: Creating customer...", data);
    const [newCustomer] = await db.insert(customers).values(data).returning();
    console.log("Action: Customer created:", newCustomer);
    return newCustomer;
  } catch (error) {
    console.error("Error creating customer:", error);
    throw new Error("Failed to create customer");
  }
}

// Action to get a customer record by their Clerk user ID
export async function getCustomerByUserIdAction(userId: string): Promise<SelectCustomer[]> {
  try {
    console.log("Action: Getting customer by user ID:", userId);
    const customer = await db.select().from(customers).where(eq(customers.userId, userId));
    // Note: This returns an array, potentially empty if not found
    console.log("Action: Found customer:", customer);
    return customer;
  } catch (error) {
    console.error("Error getting customer by user ID:", error);
    throw new Error("Failed to get customer by user ID");
  }
}

// Action to update a customer record using their Clerk user ID
export async function updateCustomerByUserIdAction(userId: string, data: Partial<InsertCustomer>): Promise<SelectCustomer> {
  try {
    console.log("Action: Updating customer by user ID:", userId, data);
    // Update and return the updated record
    const [updatedCustomer] = await db.update(customers).set(data).where(eq(customers.userId, userId)).returning();
    if (!updatedCustomer) {
      throw new Error("Customer not found for update by user ID");
    }
    console.log("Action: Customer updated by user ID:", updatedCustomer);
    return updatedCustomer;
  } catch (error) {
    console.error("Error updating customer by user ID:", error);
    throw new Error("Failed to update customer by user ID");
  }
}

// Action to update a customer record using their Stripe Customer ID
// Needed because webhooks often only provide Stripe IDs
export async function updateCustomerByStripeCustomerIdAction(stripeCustomerId: string, data: Partial<InsertCustomer>): Promise<SelectCustomer> {
  try {
    console.log("Action: Updating customer by Stripe ID:", stripeCustomerId, data);
    const [updatedCustomer] = await db.update(customers).set(data).where(eq(customers.stripeCustomerId, stripeCustomerId)).returning();
    if (!updatedCustomer) {
      // Important: Don't throw an error here if not found, as the webhook might be slightly ahead
      // or for a customer we haven't fully processed. Log a warning instead.
      console.warn(`Customer not found for update by Stripe ID: ${stripeCustomerId}. Data:`, data);
      // Return a structure indicating not found, or simply return undefined/null
      // For simplicity, let's conform to the return type, but indicate failure via logs
      return {} as SelectCustomer; // Or handle more gracefully
    }
    console.log("Action: Customer updated by Stripe ID:", updatedCustomer);
    return updatedCustomer;
  } catch (error) {
    console.error("Error updating customer by Stripe ID:", error);
    throw new Error("Failed to update customer by Stripe ID");
  }
}
