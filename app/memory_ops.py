from fastapi import APIRouter, Body
import json, os, datetime

router = APIRouter()
MEM_PATH = "/data/checkpoints"

@router.post("/memory_ops")
def memory_ops(action: str = Body(...), payload: dict = Body(default={})):
    os.makedirs(MEM_PATH, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

    if action == "save":
        path = os.path.join(MEM_PATH, f"checkpoint_{timestamp}.json")
        with open(path, "w") as f:
            json.dump(payload, f)
        return {"status": "success", "output": f"Saved {path}"}

    elif action == "restore":
        path = payload.get("path")
        if not path or not os.path.exists(path):
            return {"status": "error", "error": "Invalid path"}
        with open(path, "r") as f:
            data = json.load(f)
        return {"status": "success", "output": data}

    return {"status": "error", "error": "Unknown action"}
