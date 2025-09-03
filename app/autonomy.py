from fastapi import APIRouter, Body
import json, os

router = APIRouter()
BB_PATH = "/data/blackboard.json"

def load_blackboard():
    if not os.path.exists(BB_PATH):
        return {"tasks": []}
    with open(BB_PATH, "r") as f:
        return json.load(f)

def save_blackboard(bb):
    with open(BB_PATH, "w") as f:
        json.dump(bb, f, indent=2)

@router.post("/autonomy")
def autonomy(task: dict = Body(...)):
    bb = load_blackboard()
    bb["tasks"].append(task)
    save_blackboard(bb)
    return {"status": "queued", "task": task}

@router.get("/autonomy")
def get_autonomy():
    return load_blackboard()
