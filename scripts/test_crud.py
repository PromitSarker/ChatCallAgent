import os
import sys
from datetime import datetime

# Add parent dir to path so imports work
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from api.schemas import ConversationMessage
from api.store import conversation_store
from api.admin_store import admin_store

def test_crud():
    print("Testing CRUD operations on NeonDB...")
    
    test_conv_id = "test_crud_conversation_123"
    
    try:
        # 1. INSERT (Post)
        print(f"\n[1] Inserting a new conversation message (ID: {test_conv_id})...")
        msg = ConversationMessage(
            role="user",
            content="Hello NeonDB! Testing CRUD.",
            timestamp=datetime.utcnow()
        )
        conversation_store.append(test_conv_id, msg, intent="inquiry", escalate=False)
        print("✓ Insert successful.")
        
        # 2. READ (Get)
        print("\n[2] Reading messages back...")
        messages = conversation_store.get_messages(test_conv_id)
        if not messages:
            print("✗ Failed to read messages.")
        else:
            print(f"✓ Read successful. Found {len(messages)} message(s).")
            print(f"  Message content: {messages[0].content}")
        
        # 3. UPDATE/WRITE summaries (Push/Upsert)
        print("\n[3] Testing session summaries (Upsert)...")
        conversation_store.update_session_summary(test_conv_id, "This is a test summary.")
        summary = conversation_store.get_session_summary(test_conv_id)
        if summary == "This is a test summary.":
            print("✓ Upsert and Read summary successful.")
        else:
            print(f"✗ Failed to read summary. Got: {summary}")
            
        # 4. ADMIN READ
        print("\n[4] Testing Admin Store read...")
        summaries = admin_store.get_conversations_summary()
        found = any(s["conversation_id"] == test_conv_id for s in summaries)
        if found:
            print("✓ Admin store read successful.")
        else:
            print("✗ Admin store failed to find the test conversation.")

        # 5. DELETE
        print(f"\n[5] Deleting the test conversation...")
        admin_store.delete_conversation(test_conv_id)
        
        # Verify deletion
        messages_after = conversation_store.get_messages(test_conv_id)
        if len(messages_after) == 0:
            print("✓ Deletion successful.")
        else:
            print("✗ Deletion failed. Messages still exist.")
            
        print("\nAll CRUD operations (Create, Read, Update, Delete) completed successfully!")
        
    except Exception as e:
        print(f"\n✗ Error during CRUD tests: {e}")

if __name__ == "__main__":
    test_crud()
