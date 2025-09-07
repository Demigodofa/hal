from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import re
import json

# Import directly from app (not app.services)
from . import github_ops, file_ops, memory_ops

router = APIRouter()

class CommandRequest(BaseModel):
    command: str

def parse_command_block(block: str):
    """Extract Action and Payload from [KEV_AI::command] blocks."""
    pattern = r"\[KEV_AI::command\](.*?)\[/KEV_AI::command\]"
    match = re.search(pattern, block, re.DOTALL)
    if not match:
        raise ValueError("Invalid command block format")

    inner = match.group(1).strip().split("\n", 1)
    if len(inner) < 2:
        raise ValueError("Malformed command block")

    # First line = Action
    action_line = inner[0].replace("Action:", "").strip()
    action = action_line

    # Rest = Payload
    payload_text = inner[1].replace("Payload:", "").strip()
    try:
        payload = json.loads(payload_text)
    except json.JSONDecodeError:
        payload = {"raw": payload_text}  # fallback to raw text

    return action, payload

@router.post("/listener")
async def kev_ai_listener(req: CommandRequest):
    try:
        action, payload = parse_command_block(req.command)

        # Dispatch actions
        if action == "github.put_file":
            result = github_ops.put_file(payload)
        elif action == "github.get_file":
            result = github_ops.get_file(payload)
        elif action == "file.write":
            result = file_ops.write_file(payload)
        elif action == "file.read":
            result = file_ops.read_file(payload)
        elif action == "memory.save":
            result = memory_ops.save_memory(payload)
        elif action == "memory.restore":
            result = memory_ops.restore_memory(payload)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

        return {
            "response": f"[KEV_AI::response]\nStatus: success\nDetails: {result}\n[/KEV_AI::response]"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

