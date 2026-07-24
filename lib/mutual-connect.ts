import {
  validateDeepSnapshot,
  type DeepSnapshot,
  type DeepSnapshotSection,
} from "./deep-profile.ts";

export type ReceiverSignal = {
  name?: string;
  currentFocus: string;
  canHelp: string;
  lookingFor: string;
};

export type MutualConnectionBrief = {
  quickRead: string;
  mutualValue: string;
  questions: [string, string, string];
  nextStep: string;
};

const NAME_LIMIT = 80;
const SIGNAL_LIMIT = 300;

export function validateReceiverSignal(value: unknown): ReceiverSignal {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Mutual Connect details are invalid.");
  }
  const record = value as Record<string, unknown>;
  const name = optionalText(record.name, "Name", NAME_LIMIT);
  const currentFocus = requiredText(
    record.currentFocus,
    "Current focus",
    SIGNAL_LIMIT,
  );
  const canHelp = requiredText(record.canHelp, "Can help with", SIGNAL_LIMIT);
  const lookingFor = requiredText(
    record.lookingFor,
    "Looking for",
    SIGNAL_LIMIT,
  );

  return {
    ...(name ? { name } : {}),
    currentFocus,
    canHelp,
    lookingFor,
  };
}

export function createMutualDisclosure(value: ReceiverSignal): string {
  const signal = validateReceiverSignal(value);
  return [
    ...(signal.name ? [`Name: ${signal.name}`] : []),
    `Current focus: ${signal.currentFocus}`,
    `Can help with: ${signal.canHelp}`,
    `Looking for: ${signal.lookingFor}`,
  ].join("\n");
}

export function createMutualConnectionBrief(
  senderValue: DeepSnapshot,
  receiverValue: ReceiverSignal,
): MutualConnectionBrief {
  const sender = validateDeepSnapshot(senderValue);
  const receiver = validateReceiverSignal(receiverValue);
  const receiverName = receiver.name || "You";
  const senderFocus =
    findSection(sender, "current-work") ??
    findSection(sender, "overview") ??
    sender.sections[0];
  const senderOffers = findSection(sender, "offers");
  const senderAsks = findSection(sender, "asks");

  const mutualValue = [
    senderAsks
      ? `${receiverName}'s experience with ${receiver.canHelp} may help ${sender.n} with ${senderAsks.body}`
      : `${receiverName} may bring useful experience in ${receiver.canHelp}`,
    senderOffers
      ? `${sender.n}'s experience with ${senderOffers.body} may help with ${receiver.lookingFor}`
      : `${sender.n}'s shared perspective may help with ${receiver.lookingFor}`,
  ].join(". In return, ");

  return {
    quickRead: `${receiverName} is focused on ${receiver.currentFocus}, while ${sender.n} is focused on ${senderFocus.body}`,
    mutualValue: `${mutualValue}.`,
    questions: [
      `What led you to ${lowercaseFirst(senderFocus.body)}?`,
      `Where do you see the strongest overlap between ${receiver.currentFocus} and ${sender.n}'s work?`,
      `If ${receiver.canHelp} could support one part of this, where would it be most useful?`,
    ],
    nextStep:
      "Agree on the smallest useful follow-up: one introduction, resource, or 20-minute conversation—and decide who will send it.",
  };
}

function findSection(
  snapshot: DeepSnapshot,
  id: DeepSnapshotSection["id"],
): DeepSnapshotSection | undefined {
  return snapshot.sections.find((section) => section.id === id);
}

function lowercaseFirst(value: string): string {
  return value.charAt(0).toLocaleLowerCase() + value.slice(1);
}

function requiredText(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const text = value.trim();
  if (!text || text.length > maxLength) {
    throw new Error(`${label} must be 1–${maxLength} characters.`);
  }
  return text;
}

function optionalText(
  value: unknown,
  label: string,
  maxLength: number,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, label, maxLength);
}
