from typing import Any, Dict, List, Union

from langchain_core.tools import tool
from pydantic import BaseModel

from agent.db import get_connection


@tool
def escalate(reason: str) -> str:
	"""
	Use this tool when the user has a complex request, complaint, or wants to talk to a human.
	It will signal the system to transfer the conversation to a human support agent.
	
	Why it's needed: Bots shouldn't handle arguments or disputes! This acts like an "emergency exit"
	button for the LLM to easily hand the interaction over to real customer support.
	"""
	return "I am connecting you to a human agent who can assist with this request. They will be with you shortly!"


@tool
def search_knowledge_base(query: str) -> str:
	"""
	Search the knowledge base for general information, policies, or FAQs.
	
	Why it's needed: Use this when the user asks a general question about RT Communication, its services, policies, or pricing.
	"""
	from agent.rag import search_documents
	return search_documents(query)


class SaveCollectedInformationInput(BaseModel):
	data: Dict[str, str]
	session_id: str = "" # Injected by the system, LLM does not need to provide this.


@tool(args_schema=SaveCollectedInformationInput)
def save_collected_information(data: Dict[str, str], session_id: str = "") -> str:
	"""
	Save pieces of information gathered from the user (e.g., for bulk message services, lead gen, etc).
	Pass a dictionary mapping the exact requested keys to the user's provided values.
	Do NOT provide session_id, it is injected automatically.
	
	Why it's needed: When the user wants to buy a service or provide their information, use this tool to securely store all the details at once.
	"""
	if not session_id:
		return "ERROR: session_id is missing."
	
	if not data:
		return "ERROR: No data provided to save."
	
	saved_keys = []
	try:
		with get_connection() as conn:
			for key, value in data.items():
				cur = conn.execute("UPDATE collected_data SET value = ?, created_at = CURRENT_TIMESTAMP WHERE session_id = ? AND key = ?", (value, session_id, key))
				if cur.rowcount == 0:
					conn.execute("INSERT INTO collected_data (session_id, key, value) VALUES (?, ?, ?)", (session_id, key, value))
				saved_keys.append(key)
			conn.commit()
		return f"Successfully saved: {', '.join(saved_keys)}."
	except Exception as e:
		return f"ERROR: Could not save information: {str(e)}"



class WriteToChatInput(BaseModel):
	message: str
	session_id: str = "" # Injected by the system, LLM does not need to provide this.


@tool(args_schema=WriteToChatInput)
def write_to_chat(message: str, session_id: str = "") -> str:
	"""
	Write a message directly to the text chat interface for the user to see.
	
	Why it's needed: Use this when the user asks you to "write it down", "spell it", or provide detailed text (like a price list or link) during a voice call.
	"""
	# The actual broadcasting logic is handled in proxy_gemini_to_client.
	# This function just acts as a stub to return success to the LLM.
	return "Message successfully written to chat."


@tool
def end_call() -> str:
	"""
	End the current voice call with the user.
	
	Why it's needed: Use this when the conversation has naturally concluded or when the user explicitly asks to hang up or end the call. ALWAYS ask for confirmation before calling this tool.
	"""
	return "Call ended successfully."
