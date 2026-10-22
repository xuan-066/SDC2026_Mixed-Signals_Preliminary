"""Validated business-scoped equipment, vendor, inventory and actual transfers."""
from datetime import date
from typing import Literal
import uuid
import hashlib

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlmodel import Session, select

from app.api.v1.accounts import now
from app.api.v1.views import asset_detail_out, vendor_out, money
from app.core import audit
from app.core.clock import Clock, get_clock
from app.core.rbac import Perm, get_owned, require
from app.db import get_session
from app.errors import Conflict, InvalidInput
from app.models import Asset, Incident, Reading, ServiceJob, StockItem, User, Vendor, TransferReceipt, new_id
from app.schemas import StockOut

router = APIRouter(prefix="/v1", tags=["management"])


class Input(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid", str_strip_whitespace=True)


class AssetIn(Input):
    name: str = Field(min_length=1, max_length=120)
    type: Literal["freezer", "chiller"]
    aliases: list[str] = Field(default_factory=list, max_length=30)
    min_c: float = Field(ge=-100, le=100)
    max_c: float = Field(ge=-100, le=100)
    capacity_l: float = Field(gt=0, le=1_000_000)
    warranty_until: date | None = None
    warranty_vendor_id: str | None = None

    @model_validator(mode="after")
    def valid_range(self):
        if self.min_c >= self.max_c:
            raise ValueError("Minimum temperature must be below maximum")
        if any(not alias.strip() or len(alias) > 100 for alias in self.aliases):
            raise ValueError("Aliases must be nonempty and at most 100 characters")
        self.aliases = list(dict.fromkeys(a.strip() for a in self.aliases))
        return self


class VendorIn(Input):
    name: str = Field(min_length=1, max_length=120)
    services: list[Literal["freezer", "chiller"]] = Field(min_length=1, max_length=2)
    callout_fee_sen: int = Field(ge=0, le=100_000_000)
    sla_hours: int = Field(ge=1, le=720)
    phone: str = Field(min_length=1, max_length=40)
    warranty_only: bool = False


class StockIn(Input):
    name: str = Field(min_length=1, max_length=120)
    qty: float = Field(ge=0, le=1_000_000_000)
    unit: str = Field(min_length=1, max_length=30)
    unit_cost_sen: int = Field(ge=0, le=100_000_000)
    volume_l: float = Field(ge=0, le=1_000_000)

    @model_validator(mode="after")
    def zero_volume(self):
        if self.qty == 0 and self.volume_l > 0:
            raise ValueError("Empty stock cannot occupy volume")
        return self


class ArchiveIn(Input):
    archived: bool


class TransferItem(Input):
    stock_item_id: str
    qty: float = Field(gt=0, le=1_000_000_000)


class TransferIn(Input):
    incident_id: str | None = None
    destination_asset_id: str
    items: list[TransferItem] = Field(min_length=1, max_length=100)


def record(session, user, action, entity_type, entity_id, details=None):
    audit.record(session, business_id=user.business_id, actor_id=user.id, action=action,
                 entity_type=entity_type, entity_id=entity_id, at=now(), details=details)


def used_volume(session, asset_id, excluding=None):
    return sum(s.volume_l for s in session.exec(select(StockItem).where(
        StockItem.asset_id == asset_id)) if s.id != excluding)


def active(asset):
    if asset.archived:
        raise Conflict("This equipment is archived. Restore it before operational changes.")


def validate_asset(session, user, body, asset=None):
    if body.warranty_vendor_id:
        vendor = get_owned(session, Vendor, body.warranty_vendor_id, user)
        if vendor.archived or body.type not in vendor.services:
            raise InvalidInput("Warranty vendor must be active and service this equipment type")
    if asset and body.capacity_l < used_volume(session, asset.id) - 1e-8:
        raise Conflict("Capacity cannot be less than currently occupied stock volume")


@router.post("/assets")
def create_asset(body: AssetIn, user: User = Depends(require(Perm.MANAGE_EQUIPMENT)),
                 session: Session = Depends(get_session), clock: Clock = Depends(get_clock)):
    validate_asset(session, user, body)
    asset = Asset(id=new_id("asset"), business_id=user.business_id, **body.model_dump())
    session.add(asset)
    record(session, user, "EQUIPMENT_CREATED", "asset", asset.id,
           {"name": asset.name, "type": asset.type})
    session.commit()
    return asset_detail_out(session, asset, user, clock.now())


@router.put("/assets/{asset_id}")
def update_asset(asset_id: str, body: AssetIn,
                 user: User = Depends(require(Perm.MANAGE_EQUIPMENT)),
                 session: Session = Depends(get_session), clock: Clock = Depends(get_clock)):
    asset = get_owned(session, Asset, asset_id, user)
    validate_asset(session, user, body, asset)
    for key, value in body.model_dump().items():
        setattr(asset, key, value)
    session.add(asset)
    record(session, user, "EQUIPMENT_UPDATED", "asset", asset.id)
    session.commit()
    return asset_detail_out(session, asset, user, clock.now())


@router.post("/assets/{asset_id}/archive")
def archive_asset(asset_id: str, body: ArchiveIn,
                  user: User = Depends(require(Perm.MANAGE_EQUIPMENT)),
                  session: Session = Depends(get_session)):
    asset = get_owned(session, Asset, asset_id, user)
    if body.archived:
        from app.coldchain.workflow import active_incident
        if used_volume(session, asset.id) > 0 or any(s.qty > 0 for s in session.exec(
                select(StockItem).where(StockItem.asset_id == asset.id))):
            raise Conflict("Move or remove stock before archiving equipment")
        if active_incident(session, asset.id):
            raise Conflict("Resolve the active incident before archiving equipment")
    asset.archived = body.archived
    session.add(asset)
    record(session, user, "EQUIPMENT_ARCHIVED" if body.archived else "EQUIPMENT_RESTORED", "asset", asset.id)
    session.commit()
    return {"id": asset.id, "archived": asset.archived}


@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: str, user: User = Depends(require(Perm.MANAGE_EQUIPMENT)),
                 session: Session = Depends(get_session)):
    asset = get_owned(session, Asset, asset_id, user)
    if (session.exec(select(Incident).where(Incident.asset_id == asset.id)).first()
            or session.exec(select(Reading).where(Reading.asset_id == asset.id)).first()
            or session.exec(select(StockItem).where(StockItem.asset_id == asset.id)).first()):
        raise Conflict("Equipment has operational history or stock. Archive it instead.")
    # Recommendations are historical references, too.
    for incident in session.exec(select(Incident).where(Incident.business_id == user.business_id)):
        if ((incident.decision or {}).get("backup_unit") or {}).get("id") == asset.id:
            raise Conflict("Equipment appears in a recorded recommendation. Archive it instead.")
    record(session, user, "EQUIPMENT_DELETED", "asset", asset.id, {"name": asset.name, "type": asset.type})
    session.delete(asset)
    session.commit()
    return {"deleted": True}


@router.get("/vendors/{vendor_id}")
def get_vendor(vendor_id: str, user: User = Depends(require(Perm.VIEW_VENDORS)),
               session: Session = Depends(get_session)):
    return vendor_out(get_owned(session, Vendor, vendor_id, user))


@router.post("/vendors")
def create_vendor(body: VendorIn, user: User = Depends(require(Perm.MANAGE_VENDORS)),
                  session: Session = Depends(get_session)):
    vendor = Vendor(id=new_id("vendor"), business_id=user.business_id, **body.model_dump())
    session.add(vendor)
    record(session, user, "VENDOR_CREATED", "vendor", vendor.id, {"name": vendor.name})
    session.commit()
    return vendor_out(vendor)


@router.put("/vendors/{vendor_id}")
def update_vendor(vendor_id: str, body: VendorIn,
                  user: User = Depends(require(Perm.MANAGE_VENDORS)),
                  session: Session = Depends(get_session)):
    vendor = get_owned(session, Vendor, vendor_id, user)
    for key, value in body.model_dump().items():
        setattr(vendor, key, value)
    session.add(vendor)
    record(session, user, "VENDOR_UPDATED", "vendor", vendor.id)
    session.commit()
    return vendor_out(vendor)


@router.post("/vendors/{vendor_id}/archive")
def archive_vendor(vendor_id: str, body: ArchiveIn,
                   user: User = Depends(require(Perm.MANAGE_VENDORS)),
                   session: Session = Depends(get_session)):
    vendor = get_owned(session, Vendor, vendor_id, user)
    vendor.archived = body.archived
    session.add(vendor)
    record(session, user, "VENDOR_ARCHIVED" if body.archived else "VENDOR_RESTORED", "vendor", vendor.id)
    session.commit()
    return {"id": vendor.id, "archived": vendor.archived}


@router.delete("/vendors/{vendor_id}")
def delete_vendor(vendor_id: str, user: User = Depends(require(Perm.MANAGE_VENDORS)),
                  session: Session = Depends(get_session)):
    vendor = get_owned(session, Vendor, vendor_id, user)
    referenced = (session.exec(select(ServiceJob).where(ServiceJob.vendor_id == vendor.id)).first()
                  or session.exec(select(Asset).where(Asset.warranty_vendor_id == vendor.id)).first())
    for incident in session.exec(select(Incident).where(Incident.business_id == user.business_id)):
        if ((incident.decision or {}).get("vendor") or {}).get("id") == vendor.id:
            referenced = True
    if referenced:
        raise Conflict("Vendor has warranty or incident/job history. Archive it instead.")
    record(session, user, "VENDOR_DELETED", "vendor", vendor.id, {"name": vendor.name})
    session.delete(vendor)
    session.commit()
    return {"deleted": True}


def stock_out(stock, user):
    return StockOut(id=stock.id, name=stock.name, qty=stock.qty, unit=stock.unit,
                    volume_l=stock.volume_l, unit_cost_rm=money(stock.unit_cost_sen, user),
                    value_rm=money(round(stock.qty * stock.unit_cost_sen), user))


@router.post("/assets/{asset_id}/stock")
def create_stock(asset_id: str, body: StockIn, user: User = Depends(require(Perm.MANAGE_STOCK)),
                 session: Session = Depends(get_session)):
    asset = get_owned(session, Asset, asset_id, user)
    active(asset)
    if used_volume(session, asset.id) + body.volume_l > asset.capacity_l + 1e-8:
        raise Conflict("Stock exceeds equipment capacity")
    stock = StockItem(id=new_id("stock"), business_id=user.business_id,
                      asset_id=asset.id, **body.model_dump())
    session.add(stock)
    record(session, user, "STOCK_CREATED", "asset", asset.id, {"stock_id": stock.id, **body.model_dump()})
    session.commit()
    return stock_out(stock, user)


@router.put("/stock/{stock_id}")
def update_stock(stock_id: str, body: StockIn, user: User = Depends(require(Perm.MANAGE_STOCK)),
                 session: Session = Depends(get_session)):
    stock = get_owned(session, StockItem, stock_id, user)
    asset = get_owned(session, Asset, stock.asset_id, user)
    active(asset)
    if used_volume(session, asset.id, stock.id) + body.volume_l > asset.capacity_l + 1e-8:
        raise Conflict("Stock exceeds equipment capacity")
    for key, value in body.model_dump().items():
        setattr(stock, key, value)
    session.add(stock)
    record(session, user, "STOCK_UPDATED", "asset", asset.id, {"stock_id": stock.id, **body.model_dump()})
    session.commit()
    return stock_out(stock, user)


@router.delete("/stock/{stock_id}")
def delete_stock(stock_id: str, user: User = Depends(require(Perm.MANAGE_STOCK)),
                 session: Session = Depends(get_session)):
    stock = get_owned(session, StockItem, stock_id, user)
    record(session, user, "STOCK_REMOVED", "asset", stock.asset_id,
           {"stock_id": stock.id, "name": stock.name, "qty": stock.qty, "volume_l": stock.volume_l})
    session.delete(stock)
    session.commit()
    return {"deleted": True}


@router.post("/transfers")
def transfer(body: TransferIn, user: User = Depends(require(Perm.MANAGE_STOCK)),
             session: Session = Depends(get_session), idempotency_key: str | None = Header(default=None)):
    receipt_key = None
    fingerprint = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
    if idempotency_key:
        if len(idempotency_key) > 200:
            raise InvalidInput("Idempotency key is too long")
        receipt_key = hashlib.sha256(f"{user.id}:{idempotency_key}".encode()).hexdigest()
        receipt = session.get(TransferReceipt, receipt_key)
        if receipt:
            if receipt.fingerprint != fingerprint:
                raise Conflict("This transfer key was already used with different quantities")
            return {"id": receipt.transfer_id, "status": "recorded"}
    destination = get_owned(session, Asset, body.destination_asset_id, user)
    active(destination)
    if len({i.stock_item_id for i in body.items}) != len(body.items):
        raise InvalidInput("Each stock item may appear only once")
    rows = [(get_owned(session, StockItem, i.stock_item_id, user), i.qty) for i in body.items]
    if len({s.asset_id for s, _ in rows}) != 1:
        raise InvalidInput("Transfer items must come from one source unit")
    source = get_owned(session, Asset, rows[0][0].asset_id, user)
    active(source)
    if source.id == destination.id or source.type != destination.type:
        raise InvalidInput("Choose another unit of the same equipment type")
    incident = get_owned(session, Incident, body.incident_id, user) if body.incident_id else None
    if incident and incident.asset_id != source.id:
        raise InvalidInput("Incident must belong to the source equipment")
    for stock, qty in rows:
        if qty > stock.qty or stock.qty <= 0:
            raise Conflict(f"Insufficient available stock for {stock.name}")
    volume = sum(s.volume_l * qty / s.qty for s, qty in rows)
    if used_volume(session, destination.id) + volume > destination.capacity_l + 1e-8:
        raise Conflict("Destination does not have enough free capacity")
    transfer_id = f"transfer_{uuid.uuid4().hex}"
    details = {"transfer_id": transfer_id, "source_asset_id": source.id,
               "destination_asset_id": destination.id, "volume_l": volume, "items": [],
               "incident_id": incident.id if incident else None}
    for stock, qty in rows:
        moved_volume = stock.volume_l * qty / stock.qty
        moved = StockItem(id=new_id("stock"), business_id=user.business_id, asset_id=destination.id,
                          name=stock.name, unit=stock.unit, qty=qty,
                          volume_l=moved_volume, unit_cost_sen=stock.unit_cost_sen)
        stock.qty = max(0, stock.qty - qty)
        stock.volume_l = max(0, stock.volume_l - moved_volume)
        session.add(stock)
        session.add(moved)
        details["items"].append({"stock_item_id": stock.id, "destination_stock_id": moved.id,
                                 "name": stock.name, "qty": qty, "unit": stock.unit})
    record(session, user, "STOCK_TRANSFERRED", "incident" if incident else "asset",
           incident.id if incident else source.id, details)
    if receipt_key:
        session.add(TransferReceipt(key=receipt_key, fingerprint=fingerprint, transfer_id=transfer_id))
    # Deliberately never modify Incident.stock_at_risk_sen: it is a historical snapshot.
    session.commit()
    return {"id": transfer_id, "status": "recorded"}
