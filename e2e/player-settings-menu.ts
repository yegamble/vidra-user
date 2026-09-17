import { expect, type Page } from "@playwright/test";

export async function openPlayerSettings(page: Page) {
  const menu = page.getByRole("menu", { name: "Settings", exact: true });
  if (!(await menu.isVisible())) await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(menu).toBeVisible();
  return menu;
}

export async function openPlayerSetting(page: Page, group: "Playback speed" | "Playback quality") {
  const settings = await openPlayerSettings(page);
  await settings.getByRole("menuitem", { name: new RegExp(`^${group} `) }).click();
  const menu = page.getByRole("menu", { name: group, exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

/** Inspect the selected value in Settings, then close it for the next action. */
export async function expectPlayerSetting(page: Page, name: string | RegExp) {
  const menu = await openPlayerSettings(page);
  await expect(menu.getByRole("menuitem", { name, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
}
