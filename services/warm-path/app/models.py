from __future__ import annotations

import re
from datetime import date
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class ContractModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=lambda value: "".join(
            word if index == 0 else word.capitalize()
            for index, word in enumerate(value.split("_"))
        ),
        populate_by_name=True,
        extra="forbid",
    )


def safe_https_url(value: str) -> str:
    if any(ord(character) < 32 or ord(character) == 127 for character in value):
        raise ValueError("URL cannot contain control characters")
    if len(value) > 2048:
        raise ValueError("URL exceeds 2,048 characters")
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError("URL must use HTTPS")
    if parsed.username or parsed.password:
        raise ValueError("URL cannot contain credentials")
    return value


def safe_single_line(value: str, label: str) -> str:
    if any(ord(character) < 32 or ord(character) == 127 for character in value):
        raise ValueError(f"{label} cannot contain control characters")
    return value


class WarmPathContact(ContractModel):
    name: ShortText = Field(max_length=80)
    role: str | None = Field(default=None, max_length=120)
    public_profile_url: str
    ask_confirmed: Literal[True]

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return safe_single_line(value, "name")

    @field_validator("role")
    @classmethod
    def normalize_role(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return safe_single_line(normalized, "role") if normalized else None

    @field_validator("public_profile_url")
    @classmethod
    def validate_profile_url(cls, value: str) -> str:
        return safe_https_url(value)


class WarmPathRequest(ContractModel):
    target_url: str
    contacts: list[WarmPathContact] = Field(min_length=1, max_length=5)

    @field_validator("target_url")
    @classmethod
    def validate_target_url(cls, value: str) -> str:
        return safe_https_url(value)

    @model_validator(mode="after")
    def reject_identity_collisions(self) -> WarmPathRequest:
        names = [contact.name.casefold() for contact in self.contacts]
        urls = [contact.public_profile_url.casefold() for contact in self.contacts]
        if len(names) != len(set(names)) or len(urls) != len(set(urls)):
            raise ValueError("selected contacts must have distinct identities")
        if self.target_url.casefold() in set(urls):
            raise ValueError("the target cannot also be a selected contact")
        return self


class Citation(ContractModel):
    title: ShortText = Field(max_length=240)
    url: str
    published_at: date | None = None

    @field_validator("url")
    @classmethod
    def validate_citation_url(cls, value: str) -> str:
        return safe_https_url(value)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        return safe_single_line(value, "citation title")


class CandidateEdge(ContractModel):
    from_: ShortText = Field(alias="from", max_length=160)
    relationship: ShortText = Field(max_length=240)
    to: ShortText = Field(max_length=160)
    citations: list[Citation] = Field(default_factory=list, max_length=5)

    @field_validator("from_", "relationship", "to")
    @classmethod
    def validate_edge_text(cls, value: str) -> str:
        return safe_single_line(value, "edge text")


class PublicEdge(CandidateEdge):
    citations: list[Citation] = Field(min_length=1, max_length=5)


class CandidatePath(ContractModel):
    contact_name: ShortText = Field(max_length=80)
    explanation: ShortText = Field(max_length=800)
    uncertainty: ShortText = Field(max_length=500)
    edges: list[CandidateEdge] = Field(min_length=1, max_length=3)
    intro_request: str = Field(default="", max_length=1200)
    evidence_completeness: float = Field(default=0.0, ge=0, le=1)
    path_directness: float = Field(default=0.0, ge=0, le=1)
    target_relevance: float = Field(default=0.0, ge=0, le=1)
    evidence_recency: float = Field(default=0.0, ge=0, le=1)
    identity_confidence: float = Field(default=0.0, ge=0, le=1)


class TargetSummary(ContractModel):
    name: ShortText = Field(max_length=120)
    organization: str | None = Field(default=None, max_length=160)
    url: str

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return safe_https_url(value)

    @field_validator("name", "organization")
    @classmethod
    def validate_identity_text(cls, value: str | None) -> str | None:
        return safe_single_line(value, "target identity") if value else value


class RankedPath(ContractModel):
    contact_name: ShortText = Field(max_length=80)
    strength: Literal["strong", "possible", "tentative"]
    explanation: ShortText = Field(max_length=800)
    uncertainty: ShortText = Field(max_length=500)
    edges: list[PublicEdge] = Field(min_length=1, max_length=3)
    intro_request: ShortText = Field(max_length=1200)


class WorkflowStep(ContractModel):
    role: Literal[
        "Circle Librarian",
        "Investor Researcher",
        "Path Scout",
        "Evidence Auditor",
        "Intro Strategist",
    ]
    artifact_type: Literal[
        "WarmPathRequest",
        "TargetArtifact",
        "ScoutArtifact",
        "AuditArtifact",
        "IntroDraft",
    ]
    item_count: int = Field(ge=0)
    status: Literal["completed"] = "completed"


class WarmPathResponse(ContractModel):
    target: TargetSummary
    paths: list[RankedPath] = Field(max_length=3)
    workflow: list[WorkflowStep] = Field(default_factory=list, max_length=5)


class TargetArtifact(ContractModel):
    target: TargetSummary
    themes: list[str] = Field(default_factory=list, max_length=20)
    sources: list[Citation] = Field(default_factory=list, max_length=30)


class ScoutArtifact(ContractModel):
    contact_name: ShortText
    paths: list[CandidatePath] = Field(default_factory=list, max_length=6)


class IntroDraft(ContractModel):
    message: ShortText = Field(max_length=1200)


class AuditDecision(ContractModel):
    path_index: int = Field(ge=0)
    decision: Literal["approve", "downgrade", "reject"]
    reason: ShortText = Field(max_length=500)
    allowed_claim_fingerprints: list[str] = Field(default_factory=list)


class AuditArtifact(ContractModel):
    decisions: list[AuditDecision]


class ActionRequest(ContractModel):
    recipient: str = Field(min_length=3, max_length=320)
    subject: ShortText = Field(max_length=160)
    message: ShortText = Field(max_length=4000)
    approved: Literal[True]

    @field_validator("recipient")
    @classmethod
    def validate_recipient(cls, value: str) -> str:
        normalized = value.strip()
        if (
            "\r" in normalized
            or "\n" in normalized
            or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized)
        ):
            raise ValueError("recipient must be one email address")
        return normalized

    @field_validator("subject")
    @classmethod
    def validate_subject(cls, value: str) -> str:
        if "\r" in value or "\n" in value:
            raise ValueError("subject cannot contain line breaks")
        return value


class ActionResponse(ContractModel):
    status: Literal["sent"]
    provider_id: ShortText


class FlowArtifacts(ContractModel):
    target: TargetArtifact
    scouts: list[ScoutArtifact]
    audit: AuditArtifact
    ranked_path_count: int = Field(ge=0, le=3)
