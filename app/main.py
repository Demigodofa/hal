from fastapi import FastAPI
from . import echo, file_ops, system_control, memory_ops, autonomy, github_router, kev_ai_router

app = FastAPI(title="HAL Runner")

# Include routers
app.include_router(echo.router)
app.include_router(file_ops.router)
app.include_router(system_control.router)
app.include_router(memory_ops.router)
app.include_router(autonomy.router)
app.include_router(github_router.router)   # GitHub router
app.include_router(kev_ai_router.router)   # KEV_AI listener router


