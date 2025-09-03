from fastapi import APIRouter, Body
import subprocess

router = APIRouter()

@router.post("/system_control")
def system_control(command: str = Body(...)):
    try:
        output = subprocess.check_output(command, shell=True, text=True)
        return {"status": "success", "output": output}
    except Exception as e:
        return {"status": "error", "error": str(e)}
