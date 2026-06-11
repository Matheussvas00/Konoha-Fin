FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8080
# Usa a API key do Gemini (AI Studio), não o Vertex AI.
ENV GOOGLE_GENAI_USE_VERTEXAI=FALSE

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
