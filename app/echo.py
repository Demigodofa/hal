from fastapi import APIRouter, Body

router = APIRouter()

@router.post("/echo")
def echo(data: dict = Body(...)):
    return {"status": "ok", "received": data}
