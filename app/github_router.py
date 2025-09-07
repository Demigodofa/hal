from fastapi import APIRouter
from . import github_ops

router = APIRouter(prefix="/github", tags=["GitHub"])

@router.get("/get_file")
def get_file(path: str):
    content = github_ops.get_file(path)
    return {"path": path, "content": content}

@router.post("/put_file")
def put_file(path: str, content: str, message: str = "update from HAL"):
    result = github_ops.put_file(path, content, message)
    return {"status": "ok", "result": result}
