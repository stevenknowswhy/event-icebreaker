import {
  OPENNESS_LEVELS,
  type Intent,
  type Openness,
} from "./icebreaker.ts";

export const DEEP_SECTION_IDS = [
  "overview",
  "background",
  "current-work",
  "timeline",
  "values",
  "interests",
  "offers",
  "asks",
  "ask-me-about",
  "connection-style",
] as const;

export type DeepSectionId = (typeof DEEP_SECTION_IDS)[number];
export type DeepLinkKind = "social" | "contact";

export type DeepProfileSection = {
  id: DeepSectionId;
  body: string;
  highlights: string[];
  approved: boolean;
  minOpenness: Openness;
  intents: Intent[];
};

export type DeepProfileLink = {
  kind: DeepLinkKind;
  label: string;
  url: string;
  approved: boolean;
  minOpenness: Openness;
  intents: Intent[];
};

export type DeepProfile = {
  v: 1;
  ownerName: string;
  sections: DeepProfileSection[];
  links: DeepProfileLink[];
};

export type DeepShareSettings = {
  openness: Openness;
  intent: Intent;
  includedSectionIds: DeepSectionId[];
  includeSocialLinks: boolean;
  includeContactLinks: boolean;
};

export type DeepSnapshotSection = {
  id: DeepSectionId;
  body: string;
  highlights: string[];
};

export type DeepSnapshotLink = {
  kind: DeepLinkKind;
  label: string;
  url: string;
};

export type DeepSnapshot = {
  v: 1;
  n: string;
  o: Openness;
  i: Intent;
  sections: DeepSnapshotSection[];
  links?: DeepSnapshotLink[];
};

const INTENTS = ["networking", "friendship", "dating", "general"] as const;
const SECTION_BODY_LIMIT = 2_000;
const SECTION_HIGHLIGHT_LIMIT = 200;
const SECTION_HIGHLIGHT_COUNT = 8;
const LINK_LABEL_LIMIT = 80;
const LINK_URL_LIMIT = 500;

export function createDeepSnapshot(
  profile: DeepProfile,
  settings: DeepShareSettings,
): DeepSnapshot {
  validateDeepProfile(profile);
  validateShareSettings(settings);

  const selectedSections = new Set(settings.includedSectionIds);
  const openness = OPENNESS_LEVELS[settings.openness];
  const sections = profile.sections
    .filter(
      (section) =>
        section.approved &&
        selectedSections.has(section.id) &&
        OPENNESS_LEVELS[section.minOpenness] <= openness &&
        section.intents.includes(settings.intent),
    )
    .map(({ id, body, highlights }) => ({ id, body, highlights }));

  const links = profile.links
    .filter(
      (link) =>
        link.approved &&
        OPENNESS_LEVELS[link.minOpenness] <= openness &&
        link.intents.includes(settings.intent) &&
        ((link.kind === "social" && settings.includeSocialLinks) ||
          (link.kind === "contact" && settings.includeContactLinks)),
    )
    .map(({ kind, label, url }) => ({ kind, label, url }));

  return validateDeepSnapshot({
    v: 1,
    n: profile.ownerName,
    o: settings.openness,
    i: settings.intent,
    sections,
    ...(links.length ? { links } : {}),
  });
}

export function validateDeepSnapshot(value: unknown): DeepSnapshot {
  const record = requireRecord(value, "Deep profile");
  if (record.v !== 1) throw new Error("Unsupported Deep profile version.");

  const sections = requireArray(record.sections, "Deep profile sections", 10)
    .map((section) => {
      const item = requireRecord(section, "Deep profile section");
      return {
        id: requireSectionId(item.id),
        body: requireText(
          item.body,
          "Deep profile section body",
          SECTION_BODY_LIMIT,
        ),
        highlights: requireTextArray(
          item.highlights,
          "Deep profile section highlights",
          SECTION_HIGHLIGHT_COUNT,
          SECTION_HIGHLIGHT_LIMIT,
        ),
      };
    });
  requireUnique(sections.map((section) => section.id), "Deep profile sections");

  const rawLinks =
    record.links === undefined
      ? undefined
      : requireArray(record.links, "Deep profile links", 12);
  const links = rawLinks?.map((link) => {
    const item = requireRecord(link, "Deep profile link");
    const kind = requireLinkKind(item.kind);
    return {
      kind,
      label: requireText(item.label, "Deep profile link label", LINK_LABEL_LIMIT),
      url: requireSafeUrl(item.url, kind),
    };
  });

  return {
    v: 1,
    n: requireText(record.n, "Deep profile name", 80),
    o: requireOpenness(record.o),
    i: requireIntent(record.i),
    sections,
    ...(links?.length ? { links } : {}),
  };
}

function validateDeepProfile(profile: DeepProfile): void {
  const record = requireRecord(profile, "Deep profile");
  if (record.v !== 1) throw new Error("Unsupported Deep profile version.");
  requireText(record.ownerName, "Deep profile owner name", 80);

  const sections = requireArray(record.sections, "Deep profile sections", 10);
  const sectionIds = sections.map((section) => {
    const item = requireRecord(section, "Deep profile section");
    const id = requireSectionId(item.id);
    requireText(item.body, "Deep profile section body", SECTION_BODY_LIMIT);
    requireTextArray(
      item.highlights,
      "Deep profile section highlights",
      SECTION_HIGHLIGHT_COUNT,
      SECTION_HIGHLIGHT_LIMIT,
    );
    if (typeof item.approved !== "boolean") {
      throw new Error("Deep profile section approval is invalid.");
    }
    requireOpenness(item.minOpenness);
    requireIntentArray(item.intents);
    return id;
  });
  requireUnique(sectionIds, "Deep profile sections");

  requireArray(record.links, "Deep profile links", 12).forEach((link) => {
    const item = requireRecord(link, "Deep profile link");
    const kind = requireLinkKind(item.kind);
    requireText(item.label, "Deep profile link label", LINK_LABEL_LIMIT);
    requireSafeUrl(item.url, kind);
    if (typeof item.approved !== "boolean") {
      throw new Error("Deep profile link approval is invalid.");
    }
    requireOpenness(item.minOpenness);
    requireIntentArray(item.intents);
  });
}

function validateShareSettings(settings: DeepShareSettings): void {
  requireOpenness(settings.openness);
  requireIntent(settings.intent);
  if (
    !Array.isArray(settings.includedSectionIds) ||
    settings.includedSectionIds.length > DEEP_SECTION_IDS.length
  ) {
    throw new Error("Selected Deep profile sections are invalid.");
  }
  settings.includedSectionIds.forEach(requireSectionId);
  requireUnique(settings.includedSectionIds, "Selected Deep profile sections");
  if (
    typeof settings.includeSocialLinks !== "boolean" ||
    typeof settings.includeContactLinks !== "boolean"
  ) {
    throw new Error("Deep profile link settings are invalid.");
  }
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function requireArray(
  value: unknown,
  label: string,
  maxItems: number,
): unknown[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`${label} are invalid.`);
  }
  return value;
}

function requireText(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requireTextArray(
  value: unknown,
  label: string,
  maxItems: number,
  maxLength: number,
): string[] {
  const items = requireArray(value, label, maxItems);
  if (
    items.some(
      (item) =>
        typeof item !== "string" ||
        item.trim().length === 0 ||
        item.length > maxLength,
    )
  ) {
    throw new Error(`${label} are invalid.`);
  }
  return items as string[];
}

function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must be unique.`);
  }
}

function requireSectionId(value: unknown): DeepSectionId {
  if (
    typeof value !== "string" ||
    !DEEP_SECTION_IDS.includes(value as DeepSectionId)
  ) {
    throw new Error("Deep profile section id is invalid.");
  }
  return value as DeepSectionId;
}

function requireOpenness(value: unknown): Openness {
  if (
    value !== "low" &&
    value !== "medium" &&
    value !== "high" &&
    value !== "max"
  ) {
    throw new Error("Deep profile openness is invalid.");
  }
  return value;
}

function requireIntent(value: unknown): Intent {
  if (
    typeof value !== "string" ||
    !INTENTS.includes(value as (typeof INTENTS)[number])
  ) {
    throw new Error("Deep profile intent is invalid.");
  }
  return value as Intent;
}

function requireIntentArray(value: unknown): Intent[] {
  const intents = requireArray(value, "Deep profile intents", INTENTS.length);
  if (!intents.length) throw new Error("Deep profile intents are invalid.");
  const validated = intents.map(requireIntent);
  requireUnique(validated, "Deep profile intents");
  return validated;
}

function requireLinkKind(value: unknown): DeepLinkKind {
  if (value !== "social" && value !== "contact") {
    throw new Error("Deep profile link kind is invalid.");
  }
  return value;
}

function requireSafeUrl(value: unknown, kind: DeepLinkKind): string {
  const url = requireText(value, "Deep profile link URL", LINK_URL_LIMIT);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Deep profile link URL is invalid.");
  }

  const allowedProtocols =
    kind === "social" ? ["https:"] : ["https:", "mailto:", "tel:"];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error("Deep profile link URL uses an unsupported protocol.");
  }
  return url;
}

