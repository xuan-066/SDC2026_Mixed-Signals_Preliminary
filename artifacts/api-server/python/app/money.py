"""Money is integer sen inside the app (plan §14)."""


def rm_str(sen: int) -> str:
    """API format: 185000 -> "1850.00"."""
    return f"{sen / 100:.2f}"


def rm_label(sen: int) -> str:
    """Human format for reasons and messages: 185000 -> "RM1,850.00"."""
    return f"RM{sen / 100:,.2f}"
