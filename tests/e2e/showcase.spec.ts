import { expect, test } from "@playwright/test";

const protectedRoutes = [
  "/dashboard/today",
  "/dashboard/inbox",
  "/dashboard/projects",
  "/assistant",
  "/dashboard/developer",
  "/settings/privacy",
];

test("landing page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
});

test("health reports the service", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.service).toBe("lifeflow");
});

for (const route of protectedRoutes) {
  test(`${route} sends anonymous visitors to login`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login/);
  });
}
