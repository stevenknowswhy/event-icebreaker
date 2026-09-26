"""Deterministic text rules for dimensions the eval demoted from the model.

The measured eval (EVAL.md) showed this checkpoint's calibrated confidence never
reaches honest thresholds on ordinal or nuanced comparisons — goal fit 34–37%,
reverse offer→search 31–41%, stage gap 0–60%, complementarity stuck at 67% with no
confidence level reaching 90% precision, and the shared-interest choice at 44% even
though the shared-interest set is already computed exactly in code. Per the spec's
demotion clause, those dimensions are decided here: pure functions, explainable
evidence, no model. They are kept out of questions.py so the dimension pass stays
what the eval validated: the offer→search 1→2 judgment and the curiosity-gap pick.
"""

from __future__ import annotations

from app.validation import SharedProfileIn

# Tokens too common in profile text to carry match signal.
_STOPWORDS = frozenset(
    ["a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "for", "from", "get", "got", "has", "have", "help", "helping", "here", "how", "i", "in", "into", "is", "it", "its", "like", "looking", "me", "my", "of", "on", "or", "our", "out", "over", "really", "some", "that", "the", "their", "them", "then", "there", "these", "they", "this", "to", "want", "wanting", "was", "we", "what", "who", "why", "will", "with", "you", "your"]
)

MIN_TOKEN_LEN = 3


def content_tokens(text: str) -> set[str]:
    """Lowercased word tokens minus stopwords — the unit of all lexical rules below."""
    tokens: set[str] = set()
    current: list[str] = []
    for char in text.casefold():
        if char.isalpha() or char.isdigit():
            current.append(char)
        elif current:
            token = "".join(current)
            if len(token) >= MIN_TOKEN_LEN and token not in _STOPWORDS:
                tokens.add(token)
            current = []
    if current:
        token = "".join(current)
        if len(token) >= MIN_TOKEN_LEN and token not in _STOPWORDS:
            tokens.add(token)
    return tokens


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _overlap_words(offer_tokens: set[str], search_tokens: set[str]) -> list[str]:
    shared = sorted(offer_tokens & search_tokens)
    return shared[:6]


def offer_search_code(offers: str | None, searches: str | None) -> tuple[bool, list[str]]:
    """True iff the offer text names something the search text also names.

    Evidence lines name the overlapping words so the verdict is checkable by the reader.
    """
    offer_tokens = content_tokens(offers or "")
    search_tokens = content_tokens(searches or "")
    words = _overlap_words(offer_tokens, search_tokens)
    if words:
        return True, [f"Both mention: {', '.join(words)}"]
    return False, ["No shared words between the offer and the search"]


def goal_fit_code(sender: SharedProfileIn, receiver: SharedProfileIn) -> tuple[int, list[str]]:
    """0–2 level from lexical overlap of the two looking-for lines.

    2 = the lines name substantially the same kind of outcome, 1 = they share at least
    one concrete thing, 0 = nothing shared. Deliberately conservative at the top:
    claiming alignment from thin overlap reads as invented precision.
    """
    a = content_tokens(sender.q or "")
    b = content_tokens(receiver.q or "")
    evidence = []
    if sender.q:
        evidence.append(f"Person 1 looking for: {sender.q}")
    if receiver.q:
        evidence.append(f"Person 2 looking for: {receiver.q}")
    if not a or not b:
        return 0, evidence or ["Neither profile states what they are looking for"]
    words = _overlap_words(a, b)
    if jaccard(a, b) >= 0.35:
        return 2, evidence
    if words:
        return 1, [f"Shared goal words: {', '.join(words)}"]
    return 0, evidence


def complementarity_code(
    sender: SharedProfileIn, receiver: SharedProfileIn, either_direction_fit: bool
) -> tuple[str, list[str]]:
    """One of identical / overlapping / complementary / unrelated, from code.

    The model's eval accuracy on this dimension (67%) never cleared the precision bar in
    two phrasings. Code can judge overlap honestly; it cannot invent complementarity, so
    "complementary" is claimed only when the offer→search rules found a real direction.
    """
    a = content_tokens(sender.h or "")
    b = content_tokens(receiver.h or "")
    if not a or not b:
        return "unrelated", ["Neither profile states what they can help with"]
    score = jaccard(a, b)
    if score >= 0.8:
        return "identical", ["The two can-help-with lists name the same skills"]
    if score >= 0.25:
        return "overlapping", [
            f"Shared skills: {', '.join(_overlap_words(a, b)) or 'partial overlap'}"
        ]
    if either_direction_fit:
        return "complementary", ["Different skills, and each side offers something the other seeks"]
    return "unrelated", ["No shared skills between the two can-help-with lists"]
