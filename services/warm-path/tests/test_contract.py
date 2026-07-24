import json
from pathlib import Path

from pydantic import ValidationError

from app.models import WarmPathRequest, WarmPathResponse

FIXTURE = json.loads(
    (Path(__file__).parents[3] / "fixtures" / "warm-path-contract.json").read_text()
)


def test_contract_accepts_camel_case_web_request() -> None:
    request = WarmPathRequest.model_validate(
        {
            "targetUrl": "https://fund.example/people/elena",
            "contacts": [
                {
                    "name": "Maya Chen",
                    "role": "Founder",
                    "publicProfileUrl": "https://people.example/maya",
                    "askConfirmed": True,
                }
            ],
        }
    )
    assert request.contacts[0].name == "Maya Chen"
    assert request.model_dump(by_alias=True)["targetUrl"].startswith("https://")


def test_contract_rejects_credentials_and_unconfirmed_contact() -> None:
    try:
        WarmPathRequest.model_validate(
            {
                "targetUrl": "https://user:secret@fund.example",
                "contacts": [
                    {
                        "name": "Maya",
                        "publicProfileUrl": "https://people.example/maya",
                        "askConfirmed": False,
                    }
                ],
            }
        )
    except ValidationError as error:
        locations = {tuple(item["loc"]) for item in error.errors()}
        assert ("targetUrl",) in locations
        assert ("contacts", 0, "askConfirmed") in locations
    else:
        raise AssertionError("unsafe input should fail")


def test_cross_service_fixture_matches_pydantic_contract() -> None:
    request = WarmPathRequest.model_validate(FIXTURE["request"])
    response = WarmPathResponse.model_validate(FIXTURE["response"])

    assert request.contacts[0].name == response.paths[0].contact_name
    try:
        WarmPathResponse.model_validate(FIXTURE["invalidResponse"])
    except ValidationError as error:
        assert error.errors()[0]["loc"][-1] == "citations"
    else:
        raise AssertionError("uncited fixture should fail")
