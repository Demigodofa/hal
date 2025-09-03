from fastapi import FastAPI
from . import echo, file_ops, system_control, memory_ops, autonomy

app = FastAPI(title="HAL Runner")

app.include_router(echo.router)
app.include_router(file_ops.router)
app.include_router(system_control.router)
app.include_router(memory_ops.router)
app.include_router(autonomy.router)
