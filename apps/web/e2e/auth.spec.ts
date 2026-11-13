import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill("Password123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test.describe("authentication", () => {
  test("rejects invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("ada@northwind.dev");
    await page.locator('input[type="password"]').fill("wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Invalid email or password")).toBeVisible();
  });

  test("signs in as the demo owner and shows the delivery dashboard", async ({ page }) => {
    await signIn(page, "ada@northwind.dev");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Ada/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active sprints" })).toBeVisible();
    await expect(page.getByText("Workload snapshot")).toBeVisible();
    await expect(page.getByRole("link", { name: "Projects" })).toBeVisible();
  });

  test("read-only users do not see write actions", async ({ page }) => {
    await signIn(page, "dennis@northwind.dev");
    await expect(page).toHaveURL("/");
    await page.getByRole("link", { name: "Projects", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await page
      .getByRole("main")
      .getByRole("link", { name: /Atlas API Platform/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Atlas API Platform" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New task" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Settings" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Backlog/ })).toBeVisible();
  });
});
