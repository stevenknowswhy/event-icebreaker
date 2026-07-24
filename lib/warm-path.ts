export type WarmPathContactInput = {
  name: string;
  role?: string;
  publicProfileUrl: string;
  askConfirmed: boolean;
};

export type WarmPathRequest = {
  targetUrl: string;
  contacts: Array<{
    name: string;
    role?: string;
    publicProfileUrl: string;
    askConfirmed: true;
  }>;
};

export type WarmPathCitation = {
  title: string;
  url: string;
  publishedAt?: string;
};

export type WarmPathEdge = {
  from: string;
  relationship: string;
  to: string;
  citations: WarmPathCitation[];
};

export type WarmPathResult = {
  target: {
    name: string;
    organization?: string;
    url: string;
  };
  paths: Array<{
    contactName: string;
    strength: "strong" | "possible" | "tentative";
    explanation: string;
    uncertainty: string;
    edges: WarmPathEdge[];
    introRequest: string;
  }>;
  workflow: Array<{
    role:
      | "Circle Librarian"
      | "Investor Researcher"
      | "Path Scout"
      | "Evidence Auditor"
      | "Intro Strategist";
    artifactType:
      | "WarmPathRequest"
      | "TargetArtifact"
      | "ScoutArtifact"
      | "AuditArtifact"
      | "IntroDraft";
    itemCount: number;
    status: "completed";
  }>;
};

export type WarmPathApiError = {
  error: {
    code: string;
    message: string;
  };
};

const URL_LIMIT = 2048;
const TEXT_LIMIT = 800;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const SINGLE_LINE_BREAKS = /[\r\n]/;
const URL_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(
  record: Record<string, unknown>,
  key: string,
  label: string,
  maxLength = TEXT_LIMIT,
  required = true,
): string | undefined {
  const value = record[key];
  if (value === undefined && !required) return undefined;
  if (
    typeof value !== "string" ||
    (required && !value.trim()) ||
    URL_CONTROL_CHARACTERS.test(value) ||
    value.length > maxLength
  ) {
    throw new Error(`The ${label} is invalid.`);
  }
  return value.trim();
}

export function validateHttpsUrl(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    CONTROL_CHARACTERS.test(value) ||
    value.length > URL_LIMIT
  ) {
    throw new Error(`Enter a valid ${label} HTTPS URL.`);
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`Enter a valid ${label} HTTPS URL.`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`The ${label} must use HTTPS.`);
  }
  if (url.username || url.password) {
    throw new Error(`The ${label} cannot contain credentials.`);
  }
  return url.href;
}

export function createWarmPathRequest(
  targetUrl: string,
  contacts: WarmPathContactInput[],
): WarmPathRequest {
  if (contacts.length < 1 || contacts.length > 5) {
    throw new Error("Choose between one and five Circle contacts.");
  }

  const normalizedTarget = validateHttpsUrl(targetUrl, "target");
  const selected = contacts.map((contact) => {
      if (!contact.askConfirmed) {
        throw new Error(
          `Confirm that you are comfortable asking ${contact.name || "this contact"}.`,
        );
      }
      const name = contact.name.trim();
      if (
        !name ||
        CONTROL_CHARACTERS.test(name) ||
        SINGLE_LINE_BREAKS.test(name) ||
        name.length > 80
      ) {
        throw new Error("A selected contact name is invalid.");
      }
      const role = contact.role?.trim();
      if (
        role &&
        (CONTROL_CHARACTERS.test(role) ||
          SINGLE_LINE_BREAKS.test(role) ||
          role.length > 120)
      ) {
        throw new Error(`The role for ${name} is too long.`);
      }
      return {
        name,
        ...(role ? { role } : {}),
        publicProfileUrl: validateHttpsUrl(
          contact.publicProfileUrl,
          `${name} public profile`,
        ),
        askConfirmed: true,
      };
    });
  const names = selected.map((contact) => contact.name.toLocaleLowerCase());
  const urls = selected.map((contact) =>
    contact.publicProfileUrl.toLocaleLowerCase(),
  );
  if (new Set(names).size !== names.length || new Set(urls).size !== urls.length) {
    throw new Error("Selected Circle contacts must have distinct identities.");
  }
  if (urls.includes(normalizedTarget.toLocaleLowerCase())) {
    throw new Error("The target cannot also be a selected Circle contact.");
  }
  return {
    targetUrl: normalizedTarget,
    contacts: selected,
  };
}

function parseCitation(value: unknown): WarmPathCitation {
  if (!isRecord(value)) throw new Error("The citation is invalid.");
  const title = readText(value, "title", "citation title", 240) as string;
  const url = validateHttpsUrl(value.url, "citation");
  const publishedAt = readText(
    value,
    "publishedAt",
    "citation date",
    40,
    false,
  );
  return { title, url, ...(publishedAt ? { publishedAt } : {}) };
}

function parseEdge(value: unknown): WarmPathEdge {
  if (!isRecord(value) || !Array.isArray(value.citations)) {
    throw new Error("The public edge is invalid.");
  }
  const citations = value.citations.slice(0, 5).map(parseCitation);
  if (!citations.length) {
    throw new Error("Every public edge requires a citation.");
  }

  return {
    from: readText(value, "from", "edge origin", 160) as string,
    relationship: readText(
      value,
      "relationship",
      "edge relationship",
      240,
    ) as string,
    to: readText(value, "to", "edge destination", 160) as string,
    citations,
  };
}

export function parseWarmPathResponse(value: unknown): WarmPathResult {
  if (!isRecord(value) || !isRecord(value.target)) {
    throw new Error("The Warm Path target is invalid.");
  }

  const target = {
    name: readText(value.target, "name", "target name", 120) as string,
    organization: readText(
      value.target,
      "organization",
      "target organization",
      160,
      false,
    ),
    url: validateHttpsUrl(value.target.url, "target"),
  };
  if (!target.organization) delete target.organization;

  if (!Array.isArray(value.paths)) {
    throw new Error("The Warm Path results are invalid.");
  }

  const paths: WarmPathResult["paths"] = [];
  for (const rawPath of value.paths.slice(0, 3)) {
    if (!isRecord(rawPath) || !Array.isArray(rawPath.edges)) continue;
    if (
      rawPath.strength !== "strong" &&
      rawPath.strength !== "possible" &&
      rawPath.strength !== "tentative"
    ) {
      continue;
    }

    try {
      const edges = rawPath.edges.slice(0, 3).map(parseEdge);
      if (!edges.length) continue;
      paths.push({
        contactName: readText(
          rawPath,
          "contactName",
          "contact name",
          80,
        ) as string,
        strength: rawPath.strength,
        explanation: readText(
          rawPath,
          "explanation",
          "path explanation",
        ) as string,
        uncertainty: readText(
          rawPath,
          "uncertainty",
          "path uncertainty",
          500,
        ) as string,
        edges,
        introRequest: readText(
          rawPath,
          "introRequest",
          "introduction request",
          1200,
        ) as string,
      });
    } catch {
      // A partially supported path must never reach the UI.
    }
  }

  const roles = new Set([
    "Circle Librarian",
    "Investor Researcher",
    "Path Scout",
    "Evidence Auditor",
    "Intro Strategist",
  ]);
  const artifactTypes = new Set([
    "WarmPathRequest",
    "TargetArtifact",
    "ScoutArtifact",
    "AuditArtifact",
    "IntroDraft",
  ]);
  const workflow: WarmPathResult["workflow"] = [];
  if (Array.isArray(value.workflow)) {
    for (const rawStep of value.workflow.slice(0, 5)) {
      if (
        isRecord(rawStep) &&
        typeof rawStep.role === "string" &&
        roles.has(rawStep.role) &&
        typeof rawStep.artifactType === "string" &&
        artifactTypes.has(rawStep.artifactType) &&
        Number.isInteger(rawStep.itemCount) &&
        (rawStep.itemCount as number) >= 0 &&
        rawStep.status === "completed"
      ) {
        workflow.push({
          role: rawStep.role as WarmPathResult["workflow"][number]["role"],
          artifactType:
            rawStep.artifactType as WarmPathResult["workflow"][number]["artifactType"],
          itemCount: rawStep.itemCount as number,
          status: "completed",
        });
      }
    }
  }

  return {
    target: {
      name: target.name,
      ...(target.organization
        ? { organization: target.organization }
        : {}),
      url: target.url,
    },
    paths,
    workflow,
  };
}

export const DEMO_WARM_PATH_RESPONSE: WarmPathResult = {
  target: {
    name: "Elena Park",
    organization: "Aster Ventures",
    url: "https://example.com/aster-ventures",
  },
  paths: [
    {
      contactName: "Maya Chen",
      strength: "strong",
      explanation:
        "Maya and Elena both participated in the same civic-technology accelerator, giving Maya a specific, professional reason to know Elena’s investment interests.",
      uncertainty:
        "Their participation is public; whether they know each other well enough for an introduction still requires Maya’s confirmation.",
      edges: [
        {
          from: "Maya Chen",
          relationship: "2025 cohort mentor",
          to: "Civic Futures Accelerator",
          citations: [
            {
              title: "Civic Futures Accelerator — 2025 mentors",
              url: "https://example.com/civic-futures-mentors",
              publishedAt: "2025-04-18",
            },
          ],
        },
        {
          from: "Civic Futures Accelerator",
          relationship: "featured investment partner",
          to: "Elena Park",
          citations: [
            {
              title: "Aster Ventures joins Civic Futures",
              url: "https://example.com/aster-civic-futures",
              publishedAt: "2025-05-02",
            },
          ],
        },
      ],
      introRequest:
        "Maya — I noticed your work with Civic Futures overlaps with Elena Park’s involvement there. I’m exploring trustworthy AI for public-sector resilience, which appears relevant to Aster’s thesis. Would you be comfortable telling me whether Elena is the right person to approach, and introducing us only if it feels appropriate?",
    },
    {
      contactName: "Theo Martins",
      strength: "possible",
      explanation:
        "Theo spoke alongside an Aster Ventures portfolio founder at a resilience conference, creating a plausible two-step route into the fund’s network.",
      uncertainty:
        "A shared panel does not prove an ongoing relationship. Ask Theo whether the connection is current before requesting an introduction.",
      edges: [
        {
          from: "Theo Martins",
          relationship: "conference co-panelist",
          to: "Nia Roberts, HarborGrid founder",
          citations: [
            {
              title: "Resilient Cities 2026 speaker program",
              url: "https://example.com/resilient-cities-program",
              publishedAt: "2026-03-10",
            },
          ],
        },
        {
          from: "HarborGrid",
          relationship: "portfolio company",
          to: "Aster Ventures",
          citations: [
            {
              title: "Aster Ventures portfolio",
              url: "https://example.com/aster-portfolio",
            },
          ],
        },
      ],
      introRequest:
        "Theo — your Resilient Cities panel with Nia Roberts surfaced a possible path to Aster Ventures. I’m working on AI-assisted emergency readiness and would value your honest read first: is Nia someone you know well enough to ask about the fund, and would you be comfortable connecting us if the fit is real?",
    },
  ],
  workflow: [
    {
      role: "Circle Librarian",
      artifactType: "WarmPathRequest",
      itemCount: 2,
      status: "completed",
    },
    {
      role: "Investor Researcher",
      artifactType: "TargetArtifact",
      itemCount: 4,
      status: "completed",
    },
    {
      role: "Path Scout",
      artifactType: "ScoutArtifact",
      itemCount: 3,
      status: "completed",
    },
    {
      role: "Evidence Auditor",
      artifactType: "AuditArtifact",
      itemCount: 3,
      status: "completed",
    },
    {
      role: "Intro Strategist",
      artifactType: "IntroDraft",
      itemCount: 2,
      status: "completed",
    },
  ],
};
