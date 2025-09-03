from fastapi import FastAPI, Body

app = FastAPI()

@app.post("/echo")
def echo(data: dict = Body(...)):
    return {"status": "ok", "received": data}
