// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInstance: vi.fn(),
  setInstanceAvatar: vi.fn(),
  deleteInstanceAvatar: vi.fn(),
  setInstanceBanner: vi.fn(),
  deleteInstanceBanner: vi.fn(),
  setInstanceLogo: vi.fn(),
  deleteInstanceLogo: vi.fn(),
}));

const { FakeApiError } = vi.hoisted(() => {
  class FakeApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code = "error") {
      super(code);
      this.status = status;
      this.code = code;
    }
  }
  return { FakeApiError };
});

vi.mock("@/lib/api", () => ({
  api: {
    getInstance: mocks.getInstance,
    setInstanceAvatar: mocks.setInstanceAvatar,
    deleteInstanceAvatar: mocks.deleteInstanceAvatar,
    setInstanceBanner: mocks.setInstanceBanner,
    deleteInstanceBanner: mocks.deleteInstanceBanner,
    setInstanceLogo: mocks.setInstanceLogo,
    deleteInstanceLogo: mocks.deleteInstanceLogo,
  },
  ApiError: FakeApiError,
  errorMessage: (_err: unknown, fallback: string) => fallback,
}));

import { InstanceBrandingManager } from "@/components/InstanceBrandingManager";

const unset = { url: "", is_fallback: true };
const set = (url: string) => ({ url, is_fallback: false });

function branding(overrides: Record<string, unknown> = {}) {
  return {
    avatar: unset,
    banner: unset,
    logos: {
      favicon: unset,
      header_wide: unset,
      header_square: unset,
      opengraph: unset,
    },
    hide_instance_name: false,
    ...overrides,
  };
}

function instanceDoc(b: Record<string, unknown> | undefined) {
  return { name: "Vidra", ...(b === undefined ? {} : { branding: b }) };
}

function pngFile(name = "logo.png", size = 1024): File {
  const file = new File(["x"], name, { type: "image/png" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mocks.getInstance.mockResolvedValue(instanceDoc(branding()));
});

describe("InstanceBrandingManager", () => {
  it("renders all six slots with the built-in-default note while everything is fallback", async () => {
    render(<InstanceBrandingManager />);
    await screen.findByRole("group", { name: "Branding assets" });
    for (const label of [
      "Avatar",
      "Banner",
      "Favicon",
      "Header logo (wide)",
      "Header logo (square)",
      "Social card image",
    ]) {
      expect(screen.getByLabelText(`${label} image`)).toBeTruthy();
    }
    expect(screen.getAllByText("Using the built-in default.").length).toBe(6);
    // Nothing is set, so nothing offers removal.
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
  });

  it("shows a set slot's current image (is_fallback-aware) with a Remove affordance", async () => {
    mocks.getInstance.mockResolvedValue(
      instanceDoc(branding({ avatar: set("/api/v1/instance/avatar") })),
    );
    render(<InstanceBrandingManager />);
    const img = await screen.findByAltText("Current avatar");
    expect(img.getAttribute("src")).toBe("http://localhost:8080/api/v1/instance/avatar");
    expect(screen.getByRole("button", { name: "Remove avatar" })).toBeTruthy();
    expect(screen.getAllByText("Using the built-in default.").length).toBe(5);
  });

  it("uploads a picked file through the slot's endpoint and re-reads the branding", async () => {
    mocks.setInstanceAvatar.mockResolvedValue({});
    render(<InstanceBrandingManager />);
    await screen.findByRole("group", { name: "Branding assets" });

    mocks.getInstance.mockResolvedValue(
      instanceDoc(branding({ avatar: set("/api/v1/instance/avatar") })),
    );
    const file = pngFile("avatar.png");
    fireEvent.change(screen.getByLabelText("Avatar image"), { target: { files: [file] } });

    await waitFor(() => expect(mocks.setInstanceAvatar).toHaveBeenCalledWith(file));
    const img = await screen.findByAltText("Current avatar");
    // The refreshed URL is cache-busted so the replacement shows immediately.
    expect(img.getAttribute("src")).toBe("http://localhost:8080/api/v1/instance/avatar?v=1");
  });

  it("routes a logo slot upload through setInstanceLogo with its type", async () => {
    mocks.setInstanceLogo.mockResolvedValue({});
    render(<InstanceBrandingManager />);
    await screen.findByRole("group", { name: "Branding assets" });

    const file = pngFile("og.png");
    fireEvent.change(screen.getByLabelText("Social card image image"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(mocks.setInstanceLogo).toHaveBeenCalledWith("opengraph", file));
  });

  it("rejects a bad extension inline without calling the API", async () => {
    render(<InstanceBrandingManager />);
    await screen.findByRole("group", { name: "Branding assets" });

    fireEvent.change(screen.getByLabelText("Favicon image"), {
      target: { files: [pngFile("anim.gif")] },
    });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("The image must be a JPEG, PNG, or WebP.")).toBeTruthy();
    expect(mocks.setInstanceLogo).not.toHaveBeenCalled();
  });

  it("rejects an oversized file inline without calling the API", async () => {
    render(<InstanceBrandingManager />);
    await screen.findByRole("group", { name: "Branding assets" });

    fireEvent.change(screen.getByLabelText("Banner image"), {
      target: { files: [pngFile("huge.png", 9 * 1024 * 1024)] },
    });
    expect(await screen.findByText("The image must be 8 MiB or smaller.")).toBeTruthy();
    expect(mocks.setInstanceBanner).not.toHaveBeenCalled();
  });

  it("maps a backend 415 to the friendly type message", async () => {
    mocks.setInstanceAvatar.mockRejectedValue(new FakeApiError(415));
    render(<InstanceBrandingManager />);
    await screen.findByRole("group", { name: "Branding assets" });

    fireEvent.change(screen.getByLabelText("Avatar image"), {
      target: { files: [pngFile("sneaky.png")] },
    });
    expect(await screen.findByText("The image must be a JPEG, PNG, or WebP.")).toBeTruthy();
  });

  it("removes only after the inline confirmation (cancel keeps the image)", async () => {
    mocks.getInstance.mockResolvedValue(
      instanceDoc(branding({ banner: set("/api/v1/instance/banner") })),
    );
    render(<InstanceBrandingManager />);
    await screen.findByAltText("Current banner");

    // Ask → confirm UI appears; cancel backs out without a DELETE.
    fireEvent.click(screen.getByRole("button", { name: "Remove banner" }));
    expect(screen.getByText("Remove this image?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Remove this image?")).toBeNull();
    expect(mocks.deleteInstanceBanner).not.toHaveBeenCalled();

    // Ask again → confirm actually deletes and the slot falls back.
    mocks.deleteInstanceBanner.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Remove banner" }));
    mocks.getInstance.mockResolvedValue(instanceDoc(branding()));
    fireEvent.click(screen.getByRole("button", { name: "Confirm removing banner" }));
    await waitFor(() => expect(mocks.deleteInstanceBanner).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByAltText("Current banner")).toBeNull());
  });

  it("renders the honest note against a pre-W1 backend without a branding block", async () => {
    mocks.getInstance.mockResolvedValue(instanceDoc(undefined));
    render(<InstanceBrandingManager />);
    expect(
      await screen.findByText("Instance branding is not supported by this server yet."),
    ).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Branding assets" })).toBeNull();
  });

  it("offers a retry when the instance document cannot be loaded", async () => {
    mocks.getInstance.mockRejectedValueOnce(new FakeApiError(500));
    render(<InstanceBrandingManager />);
    expect(await screen.findByText("Could not load the instance branding.")).toBeTruthy();

    mocks.getInstance.mockResolvedValue(instanceDoc(branding()));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("group", { name: "Branding assets" })).toBeTruthy();
  });
});
