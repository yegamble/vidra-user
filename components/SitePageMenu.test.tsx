// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SitePageMenu } from "./SitePageMenu";

afterEach(cleanup);
it("shows each menu destination in server order, using the custom label when set", () => {
  render(<SitePageMenu pages={[
    { slug: "privacy", title: "Privacy Policy", menu_label: "" },
    { slug: "compliance", title: "Compliance Notice", menu_label: "2257 Compliance" },
  ]} />);
  const links = within(screen.getByRole("navigation", { name: "Site information" })).getAllByRole("link");
  expect(links.map(link => [link.textContent, link.getAttribute("href")])).toEqual([
    ["Code of Conduct", "/about/instance/moderation"],
    ["Privacy Policy", "/p/privacy"],
    ["2257 Compliance", "/p/compliance"],
  ]);
});
it("leaves the shell alone when no menu entries have been published", () => {
  render(<SitePageMenu pages={[]} />);
  expect(screen.queryByRole("navigation")).toBeNull();
});
