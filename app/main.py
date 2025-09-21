from fastapi import FastAPI
from . import echo, file_ops, system_control, memory_ops, autonomy, github_router, kev_ai_router

app = FastAPI(title="HAL Runner")

# app/main.py  
from fastapi.middleware.cors import CORSMiddleware

ALLOWED_ORIGINS = [
    "https://demigodofa.github.io",   # your GitHub Pages origin
    "https://chat.openai.com",        # keep if you also use the extension
    "https://chatgpt.com",
    "https://claude.ai/*",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.github\.io$",
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-KEV-Signature", "Authorization"],
    max_age=86400,
)
# Include routers
app.include_router(echo.router)
app.include_router(file_ops.router)
app.include_router(system_control.router)
app.include_router(memory_ops.router)
app.include_router(autonomy.router)
app.include_router(github_router.router)   # GitHub router
app.include_router(kev_ai_router.router)   # KEV_AI listener router


