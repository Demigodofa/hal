# app/github_ops.py
import os
import requests
import base64

GITHUB_API = "https://api.github.com"
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPO = os.getenv("GITHUB_REPO")
GITHUB_USER = os.getenv("GITHUB_USER")

headers = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json",
}

def get_file(path, branch="main"):
    url = f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{path}?ref={branch}"
    r = requests.get(url, headers=headers)
    r.raise_for_status()
    return base64.b64decode(r.json()["content"]).decode("utf-8")

def put_file(path, content, message="update via HAL", branch="main"):
    url = f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{path}"
    try:
        existing = requests.get(url, headers=headers).json()
        sha = existing.get("sha")
    except:
        sha = None

    data = {
        "message": message,
        "content": base64.b64encode(content.encode("utf-8")).decode("utf-8"),
        "branch": branch,
    }
    if sha:
        data["sha"] = sha

    r = requests.put(url, headers=headers, json=data)
    r.raise_for_status()
    return r.json()

def list_files(path=""):
    url = f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{path}"
    r = requests.get(url, headers=headers)
    r.raise_for_status()
    return [f["name"] for f in r.json()]
