# Laya sidecar — single container, checkpoint weights baked in.
# Build from laya-sidecar/:  docker build -t laya-sidecar .
# Run:                       docker run -p 8080:8080 -e LAYA_ALLOWED_ORIGINS=https://your-app.example laya-sidecar

FROM python:3.13-slim

# CPU-only torch from the PyTorch index; runtime never reaches the network
# (HF_HUB_OFFLINE=1) because the checkpoint is baked in below.
ENV PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models \
    HF_HUB_OFFLINE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /srv

COPY requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple \
      torch==2.14.0+cpu \
 && pip install -r requirements.txt

# Bake the English checkpoint (the launch default per the approved spec) into the
# image so a cold boot never downloads anything and can run fully offline.
# ~800 MB — the resulting image is roughly 2.5–3 GB.
# HF_HUB_OFFLINE=0 here overrides the runtime ENV for this one build step: the
# bake needs the network, the runtime (every later step) must not.
RUN HF_HUB_OFFLINE=0 python -c "from huggingface_hub import snapshot_download; snapshot_download('convaiinnovations/laya')"

COPY app/ app/
COPY contract/ contract/
COPY pytest.ini requirements-dev.txt ./
# Tests and eval are shipped in the image on purpose: run them against the baked
# weights with  docker run --rm laya-sidecar pytest -q  before pushing the image.
COPY eval.py eval_corpus.json ./
COPY tests/ tests/

EXPOSE 8080
# Warm-up runs on a startup thread; /health returns 503 until the model is ready.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
