import type {
  DeepSectionId,
  DeepSnapshot,
} from "../lib/deep-profile";

export const DEEP_SECTION_LABELS: Record<DeepSectionId, string> = {
  overview: "Overview",
  background: "Background",
  "current-work": "Current work",
  timeline: "Selected timeline",
  values: "Values and worldview",
  interests: "Interests",
  offers: "How I can help",
  asks: "What I am looking for",
  "ask-me-about": "Ask me about",
  "connection-style": "How I like to connect",
};

export function DeepProfilePage({
  snapshot,
  preview = false,
}: {
  snapshot: DeepSnapshot;
  preview?: boolean;
}) {
  return (
    <article className="personal-wiki" aria-label={`${snapshot.n}'s Personal Wiki`}>
      <header className="personal-wiki__hero">
        <p className="step-label">
          {preview ? "PRIVATE PREVIEW" : "DEEP CONNECTION STORY"}
        </p>
        <h2>{snapshot.n}</h2>
        <div className="personal-wiki__meta">
          <span>{snapshot.i}</span>
          <span>{snapshot.o} openness</span>
          <span>{snapshot.sections.length} approved sections</span>
        </div>
      </header>

      <nav className="personal-wiki__nav" aria-label="Profile sections">
        {snapshot.sections.map((section) => (
          <a href={`#deep-${section.id}`} key={section.id}>
            {DEEP_SECTION_LABELS[section.id]}
          </a>
        ))}
      </nav>

      <div className="personal-wiki__sections">
        {snapshot.sections.map((section) => (
          <section id={`deep-${section.id}`} key={section.id}>
            <p className="step-label">{DEEP_SECTION_LABELS[section.id]}</p>
            <p>{section.body}</p>
            {section.highlights.length > 0 && (
              <ul className="personal-wiki__highlights">
                {section.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {snapshot.links && snapshot.links.length > 0 && (
        <footer className="personal-wiki__links">
          <p className="step-label">SELECTED LINKS</p>
          <div>
            {snapshot.links.map((link) => (
              <a
                href={link.url}
                key={`${link.kind}-${link.label}-${link.url}`}
                rel="noreferrer noopener"
                target="_blank"
              >
                {link.label}
                <span>{link.kind}</span>
              </a>
            ))}
          </div>
        </footer>
      )}
    </article>
  );
}

