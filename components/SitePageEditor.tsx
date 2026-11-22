"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { errorMessage } from "@/lib/api/error-message";
import { sitePages, type SitePage } from "@/lib/api/site-pages";

export function SitePageEditor({ page }: { page?: SitePage }) {
  const router = useRouter();
  const [slug, setSlug] = useState(page?.slug ?? "");
  const [title, setTitle] = useState(page?.title ?? "");
  const [body, setBody] = useState(page?.body ?? "");
  const [label, setLabel] = useState(page?.menu_label ?? "");
  const [inMenu, setInMenu] = useState(page?.in_menu ?? false);
  const [order, setOrder] = useState(String(page?.menu_order ?? 0));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function write(remove: boolean) {
    setBusy(true);
    setError("");
    try {
      if (remove && page) {
        await sitePages.remove(page.slug, page.revision);
      } else {
        await sitePages.save(slug, {
          title, body, menu_label: label, in_menu: inMenu, menu_order: Number(order),
          ...(page ? { revision: page.revision } : {}),
        });
      }
      router.push("/admin/pages");
    } catch (err) {
      setError(errorMessage(err, "Could not update the page.", {
        "409": page ? "This page changed or was deleted. Copy your draft and reload before trying again." : "That page address is already in use.",
      }));
      setConfirmDelete(false);
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void write(false);
  }

  return (
    <form onSubmit={save}>
      <fieldset disabled={busy} className="flex flex-col gap-4">
        <Input label="Page title" value={title} onChange={e => setTitle(e.target.value)} required maxLength={150} />
        <Input label="Page address" hint="The permanent part after /p/, using lowercase letters, numbers and single hyphens."
          value={slug} onChange={e => setSlug(e.target.value)} required readOnly={!!page} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        <Textarea label="Page content (Markdown)" value={body} onChange={e => setBody(e.target.value)} required rows={14} />
        <Checkbox label="Show in site menu" checked={inMenu} onChange={e => setInMenu(e.target.checked)} />
        {inMenu && <>
          <Input label="Menu label" hint="Leave blank to use the page title." value={label} onChange={e => setLabel(e.target.value)} maxLength={150} />
          <Input label="Menu order" hint="Lower numbers appear first." type="number" min={0} max={2147483647} step={1} required value={order} onChange={e => setOrder(e.target.value)} />
        </>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Save page</Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/admin/pages")}>Cancel</Button>
          {page && <Button type="button" variant="danger-outline" onClick={() => setConfirmDelete(true)}>Delete page</Button>}
        </div>
      </fieldset>
      {confirmDelete && page && (
        <Modal title="Delete page?" onClose={() => { if (!busy) setConfirmDelete(false); }}>
          <p className="text-sm text-fg">Deleting “{page.title}” removes its public address and menu entry.</p>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button type="button" variant="danger" disabled={busy} onClick={() => void write(true)}>Delete permanently</Button>
          </div>
        </Modal>
      )}
    </form>
  );
}
