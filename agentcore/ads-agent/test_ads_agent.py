import json

from fastapi.testclient import TestClient

from ads_agent import (
    AgentRequest,
    account_context,
    app,
    extract_agent_payload,
    is_write_tool,
    mcp_headers,
    normalize_tool_arguments,
    summarize_csv,
)


def request_payload(**overrides):
    values = {
        "prompt": "Which campaign performed worst?",
        "access_token": "short-lived-access-token",
        "client_id": "amazon-client-id",
        "model_base_url": "https://model.example.com/v1",
        "model_api_key": "model-api-key",
        "model_name": "example-model",
        "region": "na",
        "profile_id": "2207112874674785",
        "advertiser_account_id": "amzn1.ads-account.g.example",
        "marketplace": "US",
        "account_name": "Amazon NA",
        "timezone": "America/Los_Angeles",
        "currency": "USD",
    }
    values.update(overrides)
    return AgentRequest.model_validate(values)


def test_health_contract():
    response = TestClient(app).get("/ping")
    assert response.status_code == 200
    assert response.json() == {"status": "Healthy"}


def test_a2a_payload_extraction():
    payload = extract_agent_payload(
        {
            "jsonrpc": "2.0",
            "params": {
                "message": {"parts": [{"kind": "text", "text": "hello"}]},
                "metadata": {"client_id": "client", "access_token": "long-enough-token"},
            },
        }
    )
    assert payload["prompt"] == "hello"
    assert payload["client_id"] == "client"


def test_write_tools_are_detected():
    assert is_write_tool("campaign_management-update_campaign")
    assert is_write_tool("campaign_management-create_campaign")
    assert not is_write_tool("reporting-get_campaign_report")
    assert not is_write_tool("reporting-create_report")
    assert not is_write_tool("reporting-create_campaign_report")
    assert not is_write_tool("campaign_management-list_campaigns")


def test_report_and_query_arguments_are_repaired():
    payload = request_payload()
    report = normalize_tool_arguments(
        "reporting-create_campaign_report",
        {"body": {"reports": [{"query": {"fields": ["campaignId", "spend"]}}]}},
        payload,
    )
    assert report["body"]["reports"][0]["query"] == {}
    query = normalize_tool_arguments(
        "campaign_management-query_campaign",
        {"body": {"accessRequestedAccount": {"advertiserAccountId": "wrong-for-multi-marketplace"}}},
        payload,
    )
    assert query["body"]["accessRequestedAccount"] == {"profileId": "2207112874674785"}


def test_complete_campaign_csv_is_aggregated_locally():
    csv_bytes = (
        "campaign.id,campaign.name,metric.totalCost,metric.sales,metric.purchases\n"
        "1,Worst,20,0,0\n"
        "2,Finite,50,100,2\n"
        "2,Finite,25,50,1\n"
    ).encode()
    summary = summarize_csv(csv_bytes, "report-1")
    assert summary["rowCount"] == 3
    assert summary["operationalWorstCampaign"]["campaignName"] == "Worst"
    finite = next(item for item in summary["campaigns"] if item["campaignId"] == "2")
    assert finite["cost"] == 75
    assert finite["sales"] == 150
    assert finite["acos"] == 50


def test_account_context_contains_real_identifiers():
    context = account_context(request_payload())
    assert "2207112874674785" in context
    assert "amzn1.ads-account.g.example" in context
    assert "America/Los_Angeles" in context


def test_mcp_headers_do_not_include_long_lived_credentials():
    headers = mcp_headers(request_payload())
    serialized = json.dumps(headers)
    assert headers["Authorization"].startswith("Bearer ")
    assert headers["Amazon-Ads-ClientId"] == "amazon-client-id"
    assert "refresh" not in serialized.lower()
    assert "secret" not in serialized.lower()


def test_model_configuration_is_request_scoped():
    payload = request_payload()
    assert payload.model_base_url == "https://model.example.com/v1"
    assert payload.model_name == "example-model"
