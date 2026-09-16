"""
TeraShield API Module
Integrates all 4 engine routers
"""

from . import hazard_router
from . import exposure_router
from . import relocation_router
from . import dashboard_router

__all__ = [
    "hazard_router",
    "exposure_router",
    "relocation_router",
    "dashboard_router"
]
