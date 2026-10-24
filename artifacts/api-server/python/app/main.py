"""Normal/interactive entrypoint. The public demo uses app.demo instead."""
from app.application import create_app

app = create_app()
