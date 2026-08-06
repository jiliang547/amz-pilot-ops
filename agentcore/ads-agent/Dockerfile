FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AGENT_PORT=9000 \
    MAX_AGENT_ROUNDS=200

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY ads_agent.py ./ads_agent.py

EXPOSE 9000

CMD ["uvicorn", "ads_agent:app", "--host", "0.0.0.0", "--port", "9000", "--log-level", "warning"]
