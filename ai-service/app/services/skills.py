"""Deterministic skill taxonomy used for extraction and resume↔JD matching.

Matching skills with code instead of asking the LLM keeps the core comparison
reproducible and hallucination-free; the LLM only adds narrative on top.
"""
from __future__ import annotations

import re
from functools import lru_cache

# canonical name -> aliases (lowercase). The canonical name itself is always an alias.
SKILL_ALIASES: dict[str, list[str]] = {
    # languages
    "JavaScript": ["javascript", "js", "es6", "ecmascript"],
    "TypeScript": ["typescript", "ts"],
    "Python": ["python", "python3"],
    "Java": ["java"],
    "C++": ["c++", "cpp"],
    "C": ["c language", "c programming", "ansi c"],
    "C#": ["c#", "csharp"],
    "Go": ["golang", "go lang"],
    "Rust": ["rust"],
    "Kotlin": ["kotlin"],
    "Swift": ["swift"],
    "PHP": ["php"],
    "Ruby": ["ruby"],
    "Scala": ["scala"],
    "SQL": ["sql"],
    "Bash": ["bash", "shell scripting", "shell script"],
    "HTML": ["html", "html5"],
    "CSS": ["css", "css3"],
    # frontend
    "React": ["react", "react.js", "reactjs"],
    "React Native": ["react native"],
    "Next.js": ["next.js", "nextjs"],
    "Vue.js": ["vue", "vue.js", "vuejs"],
    "Angular": ["angular", "angularjs"],
    "Redux": ["redux", "redux toolkit"],
    "Tailwind CSS": ["tailwind", "tailwindcss", "tailwind css"],
    "Vite": ["vite"],
    "Webpack": ["webpack"],
    # backend
    "Node.js": ["node.js", "nodejs", "node js", "node"],
    "Express.js": ["express", "express.js", "expressjs"],
    "NestJS": ["nestjs", "nest.js"],
    "Django": ["django"],
    "Flask": ["flask"],
    "FastAPI": ["fastapi"],
    "Spring Boot": ["spring boot", "springboot", "spring"],
    "ASP.NET": ["asp.net", ".net", "dotnet", ".net core"],
    "GraphQL": ["graphql"],
    "REST APIs": ["rest", "rest api", "rest apis", "restful", "restful apis", "restful api"],
    "gRPC": ["grpc"],
    "Microservices": ["microservices", "microservice"],
    "WebSockets": ["websocket", "websockets", "socket.io"],
    # data
    "MongoDB": ["mongodb", "mongo", "mongoose"],
    "PostgreSQL": ["postgresql", "postgres"],
    "MySQL": ["mysql"],
    "SQLite": ["sqlite"],
    "Redis": ["redis"],
    "Elasticsearch": ["elasticsearch", "elastic search"],
    "DynamoDB": ["dynamodb"],
    "Cassandra": ["cassandra"],
    "Kafka": ["kafka", "apache kafka"],
    "RabbitMQ": ["rabbitmq"],
    "DBMS": ["dbms", "database management", "database design", "normalization"],
    # cloud / devops
    "AWS": ["aws", "amazon web services", "ec2", "s3", "lambda"],
    "GCP": ["gcp", "google cloud"],
    "Azure": ["azure"],
    "Docker": ["docker", "containers", "containerization"],
    "Kubernetes": ["kubernetes", "k8s"],
    "CI/CD": ["ci/cd", "ci cd", "continuous integration", "github actions", "jenkins", "gitlab ci"],
    "Terraform": ["terraform"],
    "Linux": ["linux", "unix"],
    "Git": ["git", "github", "gitlab", "version control"],
    "Nginx": ["nginx"],
    "Vercel": ["vercel"],
    # CS fundamentals
    "Data Structures": ["data structures", "data structure", "dsa"],
    "Algorithms": ["algorithms", "algorithm", "problem solving", "competitive programming"],
    "OOP": ["oop", "object oriented", "object-oriented", "object oriented programming"],
    "Operating Systems": ["operating systems", "operating system"],
    "Computer Networks": ["computer networks", "computer networking", "networking", "tcp/ip"],
    "System Design": ["system design", "distributed systems", "scalability", "low level design", "high level design"],
    "Design Patterns": ["design patterns", "design pattern", "solid principles", "solid"],
    "Multithreading": ["multithreading", "concurrency", "multi-threading"],
    # testing / practices
    "Unit Testing": ["unit testing", "unit tests", "jest", "pytest", "junit", "mocha", "vitest", "tdd"],
    "Agile": ["agile", "scrum"],
    # AI / data science
    "Machine Learning": ["machine learning", "ml"],
    "Deep Learning": ["deep learning", "neural networks"],
    "NLP": ["nlp", "natural language processing"],
    "LLMs": ["llm", "llms", "large language models", "generative ai", "genai", "gen ai"],
    "RAG": ["rag", "retrieval augmented generation", "retrieval-augmented generation"],
    "LangChain": ["langchain"],
    "PyTorch": ["pytorch"],
    "TensorFlow": ["tensorflow"],
    "Pandas": ["pandas"],
    "NumPy": ["numpy"],
    "Vector Databases": ["vector database", "vector databases", "chroma", "chromadb", "pinecone", "qdrant", "faiss"],
    # security / auth
    "JWT": ["jwt", "json web token", "json web tokens"],
    "OAuth": ["oauth", "oauth2", "oauth 2.0"],
    # soft skills
    "Communication": ["communication", "communication skills"],
    "Leadership": ["leadership", "mentoring", "mentorship"],
    "Teamwork": ["teamwork", "collaboration", "cross-functional"],
}

# Aliases that are fine for normalising an explicit skill list ("Node" -> Node.js) but too
# ambiguous to detect in free text ("the rest of", "a tree node", "express interest").
AMBIGUOUS_IN_TEXT = frozenset({"node", "express", "rest", "spring", "solid", "containers", "s3", "lambda", "ml", "ts", "communication"})

_BOUNDARY_BEFORE = r"(?<![A-Za-z0-9+#])"
_BOUNDARY_AFTER = r"(?![A-Za-z0-9+#])"


@lru_cache
def _alias_index() -> dict[str, str]:
    index: dict[str, str] = {}
    for canonical, aliases in SKILL_ALIASES.items():
        index[_key(canonical)] = canonical
        for alias in aliases:
            index[_key(alias)] = canonical
    return index


@lru_cache
def _patterns() -> list[tuple[str, re.Pattern[str]]]:
    compiled = []
    for canonical, aliases in SKILL_ALIASES.items():
        terms = sorted(
            {a for a in aliases if a not in AMBIGUOUS_IN_TEXT} | {canonical.lower()} - AMBIGUOUS_IN_TEXT,
            key=len,
            reverse=True,
        )
        if not terms:
            continue
        body = "|".join(re.escape(t) for t in terms)
        compiled.append((canonical, re.compile(f"{_BOUNDARY_BEFORE}(?:{body}){_BOUNDARY_AFTER}", re.IGNORECASE)))
    return compiled


def _key(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _loose_key(text: str) -> str:
    """Key for skills outside the taxonomy: 'Node JS' == 'nodejs'."""
    return re.sub(r"[^a-z0-9+#]", "", text.lower())


def normalize_skill(name: str) -> str:
    """Map an arbitrary skill string to its canonical taxonomy name when known."""
    cleaned = re.sub(r"\s+", " ", (name or "").strip())
    if not cleaned:
        return ""
    return _alias_index().get(_key(cleaned)) or _alias_index().get(_key(cleaned.rstrip("."))) or cleaned


def extract_skills(text: str) -> list[str]:
    """Return canonical skills mentioned in text, ordered by first occurrence."""
    found: list[tuple[int, str]] = []
    for canonical, pattern in _patterns():
        match = pattern.search(text or "")
        if match:
            found.append((match.start(), canonical))
    found.sort()
    return [name for _, name in found]


def normalize_many(skills: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for s in skills:
        canon = normalize_skill(s)
        key = _loose_key(canon)
        if canon and key not in seen:
            seen.add(key)
            out.append(canon)
    return out


def skill_overlap(candidate: list[str], required: list[str]) -> tuple[list[str], list[str]]:
    """Split `required` into (matched, missing) against `candidate`, using canonical names."""
    have = {_loose_key(s) for s in normalize_many(candidate)}
    matched, missing = [], []
    for skill in normalize_many(required):
        (matched if _loose_key(skill) in have else missing).append(skill)
    return matched, missing
