"use client";

import { useEffect, useState } from "react";

import {
  MY_CIRCLE_STORAGE_KEY,
  parseCircleContacts,
  removeCircleContact,
  type CircleContact,
} from "../lib/my-circle";
import { SiteFooter, SiteHeader } from "./icebreaker-app";

function writeContacts(contacts: CircleContact[]): void {
  localStorage.setItem(MY_CIRCLE_STORAGE_KEY, JSON.stringify(contacts));
}

export function MyCircle() {
  const [contacts, setContacts] = useState<CircleContact[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(MY_CIRCLE_STORAGE_KEY);
        setContacts(stored ? parseCircleContacts(JSON.parse(stored)) : []);
      } catch {
        setContacts([]);
      }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function removeContact(contactId: string) {
    setContacts((current) => {
      const next = removeCircleContact(current, contactId);
      writeContacts(next);
      return next;
    });
  }

  return (
    <main>
      <SiteHeader mode="circle" />
      <section className="circle-hero shell">
        <div>
          <p className="eyebrow">CONSENT-BASED NETWORKING</p>
          <h1>My Circle.</h1>
          <p>
            Profiles you deliberately save after a real exchange. No imported
            address book and no scraped social graph.
          </p>
        </div>
        <div className="circle-privacy">
          <span aria-hidden="true">◉</span>
          <div>
            <strong>Saved only on this device</strong>
            <p>Nothing leaves until you select it for a Warm Path search.</p>
          </div>
        </div>
      </section>

      <section className="circle-section">
        <div className="shell">
          <div className="section-heading section-heading--compact">
            <div>
              <p className="step-label">PEOPLE YOU ACTUALLY MET</p>
              <h2>{contacts.length ? `${contacts.length} in your Circle` : "Your Circle starts with a real exchange."}</h2>
            </div>
            <a
              className={`button button--primary${contacts.length ? "" : " is-disabled"}`}
              href={contacts.length ? "/warm-path" : "#circle-empty"}
              aria-disabled={!contacts.length}
            >
              Find a Warm Path
            </a>
          </div>

          {!loaded || contacts.length === 0 ? (
            <div className="circle-empty" id="circle-empty">
              <span aria-hidden="true">◎</span>
              <h3>{loaded ? "No saved profiles yet." : "Checking this device…"}</h3>
              <p>
                Open someone’s Icebreaker card and choose “Save to My Circle.”
                Their shared card stays local until you decide otherwise.
              </p>
              <a className="button button--secondary" href="/receive">
                Open a profile
              </a>
            </div>
          ) : (
            <ul className="circle-list">
              {contacts.map((contact) => (
                <li key={contact.id}>
                  <div className="circle-contact__mark" aria-hidden="true">
                    {contact.profile.n.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="circle-contact__body">
                    <h3>{contact.profile.n}</h3>
                    {contact.profile.r && <p>{contact.profile.r}</p>}
                    <div className="circle-contact__meta">
                      <span>
                        {contact.profile.u
                          ? "Public identity shared"
                          : "Public URL needed for research"}
                      </span>
                      <span>
                        Saved {new Date(contact.savedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="circle-contact__actions">
                    {contact.profile.u && (
                      <a
                        className="button button--quiet"
                        href={contact.profile.u}
                        rel="noreferrer"
                        target="_blank"
                      >
                        View profile
                      </a>
                    )}
                    <button
                      className="button button--quiet"
                      type="button"
                      onClick={() => removeContact(contact.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
