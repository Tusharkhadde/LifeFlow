import {
  createExpenseSchema,
  createIncomeSchema,
  searchExpensesSchema,
  updateBudgetSchema,
  createReminderSchema,
  createTaskSchema,
  createGoalSchema,
  getAnalyticsSchema,
  updateProfileSchema,
  queryDatabaseSchema,
} from "../src/lib/agent-tools";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error("Assertion failed:", message);
    process.exit(1);
  }
}

console.log("Testing 10 AI Assistant Tool Schemas and Validation...");

// 1. createExpense
const expResult = createExpenseSchema.safeParse({ amount: 2000, category: "Electronics", description: "Mouse" });
assert(expResult.success, "createExpense schema validation failed");
assert(expResult.data?.amount === 2000, "createExpense amount mismatch");

// 2. createIncome
const incResult = createIncomeSchema.safeParse({ amount: 70000, category: "Salary" });
assert(incResult.success, "createIncome schema validation failed");

// 3. searchExpenses
const searchResult = searchExpensesSchema.safeParse({ category: "Food", minAmount: 100 });
assert(searchResult.success, "searchExpenses schema validation failed");

// 4. updateBudget
const budgetResult = updateBudgetSchema.safeParse({ monthlyBudget: 25000 });
assert(budgetResult.success, "updateBudget schema validation failed");

// 5. createReminder
const remResult = createReminderSchema.safeParse({ title: "Pay electricity bill", datetime: "2026-08-05T17:00:00Z" });
assert(remResult.success, "createReminder schema validation failed");

// 6. createTask
const taskResult = createTaskSchema.safeParse({ title: "File taxes", urgency: "urgent" });
assert(taskResult.success, "createTask schema validation failed");

// 7. createGoal
const goalResult = createGoalSchema.safeParse({ title: "Save for trip", target: 50000 });
assert(goalResult.success, "createGoal schema validation failed");

// 8. getAnalytics
const analyticsResult = getAnalyticsSchema.safeParse({ timeframe: "this_month" });
assert(analyticsResult.success, "getAnalytics schema validation failed");

// 9. updateProfile
const profileResult = updateProfileSchema.safeParse({ name: "Tushar", language: "en" });
assert(profileResult.success, "updateProfile schema validation failed");

// 10. queryDatabase
const dbResult = queryDatabaseSchema.safeParse({ entityType: "expenses", status: "all" });
assert(dbResult.success, "queryDatabase schema validation failed");

console.log("All 10 tool schemas & validation tests passed successfully! ✅");
