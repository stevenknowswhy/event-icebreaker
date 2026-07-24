import {
  validateSharedProfile,
  type SharedProfile,
} from "./icebreaker.ts";

export const MY_CIRCLE_STORAGE_KEY = "event-icebreaker.circle.v1";

export type CircleContact = {
  id: string;
  profile: SharedProfile;
  savedAt: string;
};

function stableProfileId(encodedProfile: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < encodedProfile.length; index += 1) {
    hash ^= encodedProfile.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `circle-${(hash >>> 0).toString(36)}`;
}

export function saveCircleContact(
  contacts: CircleContact[],
  profile: SharedProfile,
  encodedProfile: string,
  savedAt = new Date().toISOString(),
): CircleContact[] {
  const id = stableProfileId(encodedProfile);
  const next: CircleContact = {
    id,
    profile: validateSharedProfile(profile),
    savedAt,
  };

  return [next, ...contacts.filter((contact) => contact.id !== id)];
}

export function removeCircleContact(
  contacts: CircleContact[],
  contactId: string,
): CircleContact[] {
  return contacts.filter((contact) => contact.id !== contactId);
}

export function parseCircleContacts(value: unknown): CircleContact[] {
  if (!Array.isArray(value)) return [];

  const contacts: CircleContact[] = [];
  for (const item of value.slice(0, 100)) {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      !("id" in item) ||
      !("profile" in item) ||
      !("savedAt" in item) ||
      typeof item.id !== "string" ||
      !item.id.startsWith("circle-") ||
      typeof item.savedAt !== "string" ||
      !Number.isFinite(Date.parse(item.savedAt))
    ) {
      continue;
    }

    try {
      contacts.push({
        id: item.id,
        profile: validateSharedProfile(item.profile),
        savedAt: item.savedAt,
      });
    } catch {
      // One malformed card must not make the rest of My Circle unavailable.
    }
  }

  return contacts;
}
