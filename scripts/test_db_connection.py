import os
import sys
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not found in environment.")
    sys.exit(1)

# Redact the password for logging
parts = DATABASE_URL.split('@')
safe_url = parts[-1] if len(parts) > 1 else "Unknown"
print(f"Attempting to connect to PostgreSQL host: {safe_url.split('/')[0]}")

try:
    conn = psycopg2.connect(DATABASE_URL)
    with conn.cursor() as cur:
        cur.execute("SELECT version();")
        version = cur.fetchone()
        print(f"Successfully connected to PostgreSQL!\nDatabase Version: {version[0]}")
    conn.close()
except Exception as e:
    print(f"Failed to connect: {e}")
