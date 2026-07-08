// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EmbedPrivacyManager } from "./EmbedPrivacyManager";
import { api } from "@/lib/api";

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

describe("EmbedPrivacyManager", () => {
  it("loads the current policy and saves a new tier", async () => {
    vi.spyOn(api, "getVideoEmbedPrivacy").mockResolvedValue({ status: "enabled" });
    const set = vi.spyOn(api, "setVideoEmbedPrivacy").mockResolvedValue({ status: "disabled" });
    render(<EmbedPrivacyManager videoId="v1" />);

    const select = (await screen.findByLabelText(
      "Where can this be embedded?",
    )) as HTMLSelectElement;
    expect(select.value).toBe("enabled");

    fireEvent.change(select, { target: { value: "disabled" } });
    fireEvent.click(screen.getByRole("button", { name: "Save embed settings" }));
    await waitFor(() => expect(set).toHaveBeenCalledWith("v1", { status: "disabled" }));
    expect(await screen.findByText("Embed settings saved.")).toBeTruthy();
  });

  it("manages the whitelist and PUTs the allow-listed domains", async () => {
    vi.spyOn(api, "getVideoEmbedPrivacy").mockResolvedValue({ status: "enabled" });
    const set = vi
      .spyOn(api, "setVideoEmbedPrivacy")
      .mockResolvedValue({ status: "whitelist", allowed_domains: ["example.com"] });
    render(<EmbedPrivacyManager videoId="v1" />);

    fireEvent.change(await screen.findByLabelText("Where can this be embedded?"), {
      target: { value: "whitelist" },
    });
    const field = screen.getByLabelText("Add allowed domain");
    fireEvent.change(field, { target: { value: "example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add domain" }));
    expect(await screen.findByText("example.com")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save embed settings" }));
    await waitFor(() =>
      expect(set).toHaveBeenCalledWith("v1", {
        status: "whitelist",
        allowed_domains: ["example.com"],
      }),
    );
  });

  it("rejects a non-bare-hostname domain before adding it", async () => {
    vi.spyOn(api, "getVideoEmbedPrivacy").mockResolvedValue({ status: "whitelist", allowed_domains: [] });
    render(<EmbedPrivacyManager videoId="v1" />);

    const field = await screen.findByLabelText("Add allowed domain");
    fireEvent.change(field, { target: { value: "https://example.com/embed" } });
    fireEvent.click(screen.getByRole("button", { name: "Add domain" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("bare hostname");
    expect(screen.queryByText("https://example.com/embed")).toBeNull();
  });

  it("blocks saving a whitelist with no domains (would 400)", async () => {
    vi.spyOn(api, "getVideoEmbedPrivacy").mockResolvedValue({ status: "whitelist", allowed_domains: [] });
    const set = vi.spyOn(api, "setVideoEmbedPrivacy");
    render(<EmbedPrivacyManager videoId="v1" />);

    await screen.findByLabelText("Where can this be embedded?");
    fireEvent.click(screen.getByRole("button", { name: "Save embed settings" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Add at least one domain");
    expect(set).not.toHaveBeenCalled();
  });
});
