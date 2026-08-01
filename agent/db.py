import os
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from typing import Generator

from agent.config import DATABASE_URL

def initialize_db():
    if not DATABASE_URL:
        print("DATABASE_URL is not set, skipping database initialization")
        return
        
    print(f"Initializing database from schema...")
    
    # We always run the schema to ensure IF NOT EXISTS tables are created
    schema_path = os.path.join(os.path.dirname(__file__), "..", "sql", "schema.sql")
    if os.path.exists(schema_path):
        with open(schema_path, "r", encoding="utf-8") as f:
            schema_script = f.read()
            
        try:
            with psycopg2.connect(DATABASE_URL) as conn:
                with conn.cursor() as cur:
                    cur.execute(schema_script)
                conn.commit()
        except Exception as e:
            print(f"Failed to initialize schema: {e}")

@contextmanager
def get_connection():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    try:
        yield conn
    finally:
        conn.close()

# Initialize schema when this module is loaded
initialize_db()
