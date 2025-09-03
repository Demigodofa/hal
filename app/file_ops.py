from fastapi import APIRouter, Body
import os

router = APIRouter()
BASE_PATH = "/data"  # safe persistent folder on Render

@router.post("/file_ops")
def file_ops(action: str = Body(...), path: str = Body(...), data: str = Body(default="")):
    full_path = os.path.join(BASE_PATH, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)

    if action == "write":
        with open(full_path, "w") as f:
            f.write(data)
        return {"status": "success", "output": f"Wrote to {full_path}"}
    elif action == "read":
        with open(full_path, "r") as f:
            return {"status": "success", "output": f.read()}
    return {"status": "error", "error": "Unknown action"}
