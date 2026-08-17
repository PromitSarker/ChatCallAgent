from fastapi import APIRouter
from typing import List, Dict, Any

from api.admin_store import admin_store

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/conversations")
def get_conversations() -> List[Dict[str, Any]]:
	return admin_store.get_conversations_summary()

@router.get("/collected_data")
def get_collected_data() -> List[Dict[str, Any]]:
	return admin_store.get_collected_data()

@router.get("/auth_codes")
def get_auth_codes() -> List[Dict[str, Any]]:
	return admin_store.get_auth_codes()

@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str):
	admin_store.delete_conversation(conversation_id)
	return {"status": "success", "message": f"Conversation {conversation_id} deleted."}

@router.delete("/conversations")
def delete_all_conversations():
	admin_store.delete_all_conversations()
	return {"status": "success", "message": "All conversations deleted."}

@router.get("/cost_summary")
def get_cost_summary() -> Dict[str, Any]:
	return admin_store.get_token_usage_summary()

@router.delete("/cost_summary")
def reset_cost_summary():
	admin_store.reset_token_usage()
	return {"status": "success", "message": "Token usage reset successfully."}

@router.get("/settings")
def get_settings() -> Dict[str, Any]:
	return {
		"agent_language": admin_store.get_setting("agent_language", "Bengali")
	}

from pydantic import BaseModel

class SettingUpdate(BaseModel):
	key: str
	value: str

@router.post("/settings")
def update_settings(setting: SettingUpdate):
	success = admin_store.update_setting(setting.key, setting.value)
	if success:
		return {"status": "success"}
	return {"status": "error", "message": "Failed to update setting"}
