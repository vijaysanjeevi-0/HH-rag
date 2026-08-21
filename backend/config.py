import os


def _load_dotenv(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, value = line.partition("=")
                    os.environ.setdefault(key.strip(), value.strip())
    except FileNotFoundError:
        pass


_load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

INDEX_DIR = os.getenv("INDEX_DIR", os.path.join(os.path.dirname(__file__), "index"))
EMBED_MODEL = "BAAI/bge-small-en-v1.5"
EMBED_DIM = 384

TOP_K = int(os.getenv("TOP_K", "5"))
OFF_TOPIC_THRESHOLD = float(os.getenv("OFF_TOPIC_THRESHOLD", "0.70"))
GROUNDING_MIN_OVERLAP = float(os.getenv("GROUNDING_MIN_OVERLAP", "0.12"))

STT_TIMEOUT = 25.0
LLM_TIMEOUT = 20.0
RETRIES = 2

STRATEGIES = ("hybrid-semantic", "hierarchical", "metadata-aware")
PROVIDERS = ("sarvam", "elevenlabs")
