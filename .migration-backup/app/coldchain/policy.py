# app/coldchain/policy.py — exact values; change them here and in plan §14 only
CRITICAL_DEVIATION_C = 3.0          # °C outside range → CRITICAL
CRITICAL_DURATION_MIN = 60          # minutes continuously out of range → CRITICAL
WARNING_MIN_STREAK = 2              # consecutive out-of-range readings → WARNING
VALID_TEMP_RANGE = (-40.0, 50.0)    # anything outside is a sensor glitch → 422
READING_WINDOW_H = 3                # hours of readings considered
VENDOR_CHASE_MIN = 60               # minutes before chasing an unconfirmed job
MAX_CHASES = 2
PARSER_MIN_CONFIDENCE = 0.6         # [S] below this → NEEDS_INFO
DEFAULT_SUPERVISOR_LIMIT_SEN = 15000  # RM150.00; stored per Business
