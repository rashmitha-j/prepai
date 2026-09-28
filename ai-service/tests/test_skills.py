from app.services.skills import extract_skills, normalize_many, normalize_skill, skill_overlap


def test_normalize_aliases():
    assert normalize_skill("reactjs") == "React"
    assert normalize_skill("NodeJS") == "Node.js"
    assert normalize_skill("node") == "Node.js"
    assert normalize_skill("postgres") == "PostgreSQL"
    assert normalize_skill("Some Niche Tool") == "Some Niche Tool"


def test_extract_handles_special_characters_and_boundaries():
    text = "Built APIs in Node.js and Express.js; C++ and C# for games; used JavaScript with React."
    skills = extract_skills(text)
    for expected in ["Node.js", "Express.js", "C++", "C#", "JavaScript", "React"]:
        assert expected in skills
    assert "Java" not in skills


def test_extract_ignores_ambiguous_words_in_prose():
    skills = extract_skills("For the rest of the tree, each node can express interest in its children.")
    assert "REST APIs" not in skills
    assert "Node.js" not in skills
    assert "Express.js" not in skills


def test_overlap_uses_canonical_names():
    matched, missing = skill_overlap(["reactjs", "node", "Mongo"], ["React", "Node.js", "SQL", "REST APIs"])
    assert matched == ["React", "Node.js"]
    assert missing == ["SQL", "REST APIs"]


def test_normalize_many_dedupes():
    assert normalize_many(["React", "react.js", "REACT", "Vue"]) == ["React", "Vue.js"]
