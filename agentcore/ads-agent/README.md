# Enhanced Amazon Ads LangGraph runtime

This service follows Amazon Ads workshop Modules 5–8:

- Python and FastAPI A2A server
- LangGraph via `langchain.agents.create_agent`
- The website's configured OpenAI-compatible model through `ChatOpenAI`
- Amazon Ads MCP through `MultiServerMCPClient` and Streamable HTTP
- Runtime `tools/list` discovery, with no filter by default
- FastAPI invocation endpoint and structured container logs

The production website remains the credential control plane. It exchanges the
stored Amazon refresh token for a short-lived access token and sends only that
token plus the Client ID to this runtime. Long-lived credentials are never
stored by the container.

## Local validation

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m pytest -q
```

## Cloudflare Container deployment

The root Worker configuration points its `EnhancedAdsContainer` image at this
directory. `wrangler deploy` builds the Python 3.13 image, pushes it to the
Cloudflare registry, and deploys the Worker binding. Leave `TOOL_FILTER` empty
to expose the complete live MCP tool list.
