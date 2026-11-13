import { expect, test } from "@playwright/test";

const TITLE = `E2E verification ${Date.now()}`;

test("creates, comments on, and deletes a task", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());

  await page.goto("/login");
  await page.locator('input[type="email"]').fill("ada@northwind.dev");
  await page.locator('input[type="password"]').fill("Password123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("link", { name: /Atlas API Platform/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Atlas API Platform" })).toBeVisible();

  await page.getByRole("button", { name: "New task" }).click();
  await page.getByPlaceholder("Harden refresh token rotation").fill(TITLE);
  await page.getByPlaceholder("Context, acceptance criteria, links…").fill(
    "Created by the Playwright workflow test.",
  );
  await page.getByRole("button", { name: "Create task" }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByText(TITLE, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/task=/);

  await page.getByRole("button", { name: "Comments" }).click();
  await page.getByPlaceholder("Write a comment…").fill("Automated comment from Playwright.");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByText("Automated comment from Playwright.")).toBeVisible();

  await page.locator('button[title="Delete task"]').click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: /Sprints/ }).click();
  await expect(page.getByRole("heading", { name: "Sprints" })).toBeVisible();
  await expect(page.getByText("Burndown")).toBeVisible();
});
