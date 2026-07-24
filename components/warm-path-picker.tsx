"use client";

import type { CircleContact } from "../lib/my-circle";

export function WarmPathPicker({
  contacts,
  selectedIds,
  confirmedIds,
  onSelect,
  onConfirm,
}: {
  contacts: CircleContact[];
  selectedIds: string[];
  confirmedIds: string[];
  onSelect: (contactId: string, selected: boolean) => void;
  onConfirm: (contactId: string, confirmed: boolean) => void;
}) {
  if (!contacts.length) {
    return (
      <div className="warm-path-empty">
        <h3>Your research-ready Circle is empty.</h3>
        <p>
          Save an Icebreaker card that includes a public professional URL, then
          return here.
        </p>
        <a className="button button--secondary" href="/circle">
          Open My Circle
        </a>
      </div>
    );
  }

  return (
    <fieldset className="warm-path-picker">
      <legend>Select up to five people you could genuinely ask</legend>
      <div className="warm-path-contact-list">
        {contacts.map((contact) => {
          const selected = selectedIds.includes(contact.id);
          return (
            <article
              className={`warm-path-contact${selected ? " is-selected" : ""}`}
              key={contact.id}
            >
              <label className="warm-path-contact__select">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={!selected && selectedIds.length >= 5}
                  onChange={(event) =>
                    onSelect(contact.id, event.target.checked)
                  }
                />
                <span>
                  <strong>{contact.profile.n}</strong>
                  <small>{contact.profile.r || "Shared Icebreaker profile"}</small>
                </span>
              </label>
              {selected && (
                <label className="warm-path-contact__confirm">
                  <input
                    type="checkbox"
                    checked={confirmedIds.includes(contact.id)}
                    onChange={(event) =>
                      onConfirm(contact.id, event.target.checked)
                    }
                  />
                  <span>
                    I would feel comfortable asking {contact.profile.n} for
                    guidance—not assuming they will introduce me.
                  </span>
                </label>
              )}
            </article>
          );
        })}
      </div>
    </fieldset>
  );
}
