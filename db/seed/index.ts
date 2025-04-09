// db/seed/index.ts
import { db } from "@/db";
import { prompts } from "../schema/prompts-schema"; // Assuming prompts schema is here

// --- Clerk Backend Client Setup ---
import { createClerkClient } from "@clerk/backend";

// Ensure Clerk Secret Key is available (add basic validation)
if (!process.env.CLERK_SECRET_KEY) {
  throw new Error("CLERK_SECRET_KEY environment variable is not set.");
}
// Initialize Clerk backend client
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
// --- End Clerk Setup ---

// --- Test User Definitions ---
// Use the +clerk_test@example.com format for easy identification
const testUsers = [
  {
    emailAddress: ["user1+clerk_test@example.com"],
    password: "testPassword123!", // Use a secure password even for tests
    firstName: "Test",
    lastName: "User1"
  },
  {
    emailAddress: ["user2+clerk_test@example.com"],
    password: "testPassword123!",
    firstName: "Test",
    lastName: "User2"
  },
  {
    emailAddress: ["user3+clerk_test@example.com"],
    password: "testPassword123!",
    firstName: "Test",
    lastName: "User3"
  }
];
// --- End Test User Definitions ---

// --- Base Prompt Data (without user_id yet) ---
const basePrompts = [
  { name: "Code Explainer", description: "Explains code in simple terms", content: "Explain this code..." },
  { name: "Bug Finder", description: "Helps identify bugs", content: "Find bugs in this code..." },
  { name: "Feature Planner", description: "Helps plan features", content: "Plan this feature..." },
  { name: "SQL Helper", description: "Assists with SQL", content: "Write SQL for..." },
  { name: "API Docs Writer", description: "Generates API docs", content: "Document this API..." },
  { name: "Code Refactorer", description: "Suggests improvements", content: "Refactor this code..." },
  { name: "Test Case Generator", description: "Creates test cases", content: "Generate tests for..." },
  { name: "UI/UX Reviewer", description: "Reviews UI/UX", content: "Review this UI..." },
  { name: "Git Command Helper", description: "Helps with Git", content: "Git command for..." }
  // Add more if needed, aim for a multiple of the number of test users (e.g., 9 prompts for 3 users)
];
// --- End Base Prompt Data ---

async function seed() {
  try {
    console.log("🌱 Starting database seeding...");

    // --- Create Test Users via Clerk API ---
    console.log("Creating test users via Clerk API...");
    // Optional: Delete existing test users first for idempotency
    // const existingTestUsers = await clerk.users.getUserList({ emailAddress: testUsers.flatMap(u => u.emailAddress) });
    // if (existingTestUsers.data.length > 0) {
    //   console.log(`Deleting ${existingTestUsers.data.length} existing test users...`);
    //   await Promise.all(existingTestUsers.data.map(user => clerk.users.deleteUser(user.id)));
    // }

    // Create users concurrently
    const createdUsers = await Promise.all(testUsers.map((userData) => clerk.users.createUser(userData)));
    console.log(
      `Successfully created ${createdUsers.length} test users:`,
      createdUsers.map((u) => ({ id: u.id, email: u.emailAddresses[0]?.emailAddress }))
    );
    // --- End User Creation ---

    // --- Prepare Prompts with User IDs ---
    if (createdUsers.length === 0) {
      throw new Error("No test users were created. Cannot proceed with seeding prompts.");
    }
    // Distribute prompts among the created users (e.g., round-robin or assign chunks)
    // Here, we assign every 3 prompts to a user (assuming 9 base prompts and 3 users)
    const promptsWithUsers = basePrompts.map((prompt, index) => {
      const userIndex = Math.floor(index / (basePrompts.length / createdUsers.length));
      const user_id = createdUsers[userIndex].id;
      if (!user_id) {
        throw new Error(`Could not get userId for user index ${userIndex}`);
      }
      return {
        ...prompt,
        user_id: user_id // Assign the Clerk user ID
      };
    });
    // --- End Prompt Preparation ---

    // --- Seed Database ---
    console.log("🗑️ Clearing existing data from 'prompts' table...");
    await db.delete(prompts); // Clear existing prompts first

    console.log("📥 Inserting seed data into 'prompts' table...");
    await db.insert(prompts).values(promptsWithUsers); // Insert prompts with user_id
    // --- End Database Seed ---

    console.log("✅ Database seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error during database seeding:", error);
    // Log specific Clerk errors if available
    if (error instanceof Error && "errors" in error) {
      console.error("Clerk API Errors:", error.errors);
    }
    throw error; // Re-throw to indicate script failure
  } finally {
    // IMPORTANT: Ensure the database connection is closed
    // This might not be strictly necessary if drizzle-kit handles it,
    // but good practice for standalone scripts.
    // await db.$client.end(); // Uncomment if using node directly
    console.log("🚪 Seed script finished.");
  }
}

// Run the seed function
seed();
