import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    raise ValueError("DATABASE_URL must be set in .env")

def add_duration_column():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC DEFAULT 0.0;")
            print("Successfully added duration_seconds to token_usage table.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    add_duration_column()
