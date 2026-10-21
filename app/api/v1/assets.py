from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.api.v1.views import asset_detail_out, asset_out, vendor_out
from app.core.clock import Clock, get_clock
from app.core.rbac import Perm, get_owned, require
from app.db import get_session
from app.models import Asset, User, Vendor
from app.schemas import AssetDetailOut, AssetOut, VendorOut

router = APIRouter(prefix="/v1", tags=["assets"])


@router.get("/assets", response_model=list[AssetOut])
def list_assets(user: User = Depends(require(Perm.VIEW_OPERATIONS)),
                session: Session = Depends(get_session), clock: Clock = Depends(get_clock)):
    """Every fridge and freezer of your business, with its status and latest temperature."""
    assets = session.exec(select(Asset).where(Asset.business_id == user.business_id)
                          .order_by(Asset.name))
    return [asset_out(session, a, clock.now()) for a in assets]


@router.get("/assets/{asset_id}", response_model=AssetDetailOut)
def get_asset(asset_id: str, user: User = Depends(require(Perm.VIEW_OPERATIONS)),
              session: Session = Depends(get_session), clock: Clock = Depends(get_clock)):
    """One unit, what's inside (RM hidden from staff) and its last 24 readings."""
    return asset_detail_out(session, get_owned(session, Asset, asset_id, user), user, clock.now())


@router.get("/vendors", response_model=list[VendorOut], tags=["vendors"])
def list_vendors(user: User = Depends(require(Perm.VIEW_VENDORS)),
                 session: Session = Depends(get_session)):
    vendors = session.exec(select(Vendor).where(Vendor.business_id == user.business_id)
                           .order_by(Vendor.name))
    return [vendor_out(v) for v in vendors]
