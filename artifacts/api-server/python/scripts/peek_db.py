"""Print the demo data in the local DB, e.g. `python scripts/peek_db.py`."""
import sqlite3
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "sejukguard.db"
db = sqlite3.connect(path)

print("UNITS")
for name, type_, capacity, warranty in db.execute(
        "select name, type, capacity_l, warranty_until from asset"):
    print(f"  {name:<16} {type_:<8} {capacity:>5.0f} L   warranty: {warranty or '-'}")

print("\nUSERS")
for name, role, business in db.execute("select name, role, business_id from user"):
    print(f"  {name:<8} {role:<10} {business}")

print("\nFREEZER 2 STOCK")
total_sen = 0
for name, qty, cost, volume in db.execute(
        "select name, qty, unit_cost_sen, volume_l from stockitem where asset_id = ?", ("a_fz2",)):
    total_sen += qty * cost
    print(f"  {name:<20} {qty:>4.0f} x RM{cost / 100:>6.2f}   {volume:>4.0f} L")
print(f"  {'TOTAL':<20} RM{total_sen / 100:,.2f}")
