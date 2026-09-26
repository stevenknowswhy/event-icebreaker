"""Build the Laya state text for a pair of profiles.

The English checkpoint reads 512 tokens and cuts from the end, so the state is
front-loaded with the fields that drive shape and fit judgments, per-person blocks
are char-capped, and names are excluded — the model gets less PII and names carry
no signal for any question this pipeline asks. Questions refer to the two people as
"person 1" (sender) and "person 2" (receiver).
"""

from __future__ import annotations

from app.validation import SharedProfileIn

PERSON_BLOCK_CHARS = 700  # ≈175 tokens each → pair state stays inside the 512-token window


def _shorten(text: str, limit: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def person_block(profile: SharedProfileIn, label: str, max_chars: int = PERSON_BLOCK_CHARS) -> str:
    """One person's front-loaded profile block. Priority: role, offers, searches, interests."""
    lines: list[str] = []
    if profile.r:
        lines.append(f"Role: {_shorten(profile.r, 120)}")
    if profile.h:
        lines.append(f"Can help with: {_shorten(profile.h, 200)}")
    if profile.q:
        lines.append(f"Looking for: {_shorten(profile.q, 200)}")
    if profile.x:
        lines.append(f"Interests: {_shorten(', '.join(profile.x), 220)}")
    if profile.s:
        lines.append(f"Current focus: {_shorten(profile.s, 140)}")
    if profile.sd:
        lines.append(f"More on the focus: {_shorten(profile.sd, 220)}")
    if profile.va:
        lines.append(f"Values: {_shorten(', '.join(profile.va), 90)}")
    if profile.c:
        lines.append(f"Communication style: {_shorten(profile.c, 100)}")
    if profile.f:
        lines.append(f"Fun fact: {_shorten(profile.f, 110)}")

    # Drop lowest-priority lines from the end until the block respects the cap.
    block = f"{label}: " + " | ".join(lines)
    while len(block) > max_chars and len(lines) > 1:
        lines.pop()
        block = f"{label}: " + " | ".join(lines)
    return _shorten(block, max_chars)


def pair_state(sender: SharedProfileIn, receiver: SharedProfileIn) -> str:
    """The single state both Laya passes run against. Person 1 = sender, person 2 = receiver."""
    return (
        "Two people at a professional event, each described only by what their shared profile says.\n"
        f"{person_block(sender, 'Person 1 (sender)')}\n"
        f"{person_block(receiver, 'Person 2 (receiver)')}"
    )
