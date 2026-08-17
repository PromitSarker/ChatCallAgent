import os
import sys

# Add project root to path so we can import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agent.db import get_connection
from api.store import conversation_store
from api.admin_store import admin_store

def test_duration_metrics():
    print("Testing Duration and Cost Per Minute Metrics...")
    
    # 1. Ensure the column exists first
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC DEFAULT 0.0;")
            conn.commit()
        print("✓ Database schema is ready")
    except Exception as e:
        print(f"Database error: {e}")
        print("Please check your DATABASE_URL in .env")
        return

    # 2. Insert mock data
    test_session_id = "test_duration_metrics_999"
    try:
        conversation_store.record_token_usage(
            session_id=test_session_id,
            input_tokens=2_000_000, # 2 million tokens
            output_tokens=1_000_000, # 1 million tokens
            model_name="models/gemini-1.5-flash",
            duration_seconds=120.0 # 2 minutes
        )
        print("✓ Mock token usage recorded")
    except Exception as e:
        print(f"Failed to record token usage: {e}")
        return

    # 3. Retrieve and print the summary
    try:
        summary = admin_store.get_token_usage_summary()
        print("\n--- Summary Results ---")
        print(f"Total Input Tokens: {summary['total_input_tokens']}")
        print(f"Total Output Tokens: {summary['total_output_tokens']}")
        print(f"Total Duration (s): {summary.get('total_duration_seconds')}")
        print(f"Total Cost (USD): ${summary['total_cost_usd']}")
        print(f"Cost per Minute (USD): ${summary.get('cost_per_minute_usd')}")
        print("-----------------------\n")
        
        # Verify correctness
        # For gemini-1.5-flash, input=0.075/1M, output=0.30/1M
        # Cost should be (2 * 0.075) + (1 * 0.30) = 0.15 + 0.30 = 0.45
        # Since duration is 120s (2 minutes), cost per minute should be 0.45 / 2 = 0.225
        print("Expected values (for the new inserted mock data):")
        print("Additional Cost: $0.45")
        print("If this was the only data, Cost per Minute: $0.225")
        
    except Exception as e:
        print(f"Failed to get summary: {e}")

    # 4. Clean up test data
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM token_usage WHERE session_id = %s", (test_session_id,))
            conn.commit()
        print("✓ Cleaned up test data")
    except Exception as e:
        print(f"Failed to clean up: {e}")

if __name__ == "__main__":
    test_duration_metrics()
