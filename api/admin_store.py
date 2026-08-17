from typing import List, Dict, Any
from agent.db import get_connection

class AdminStore:
	def get_conversations_summary(self) -> List[Dict[str, Any]]:
		# Get latest state of each conversation
		query = """
			SELECT 
				c.conversation_id,
				COUNT(c.id) as message_count,
				MAX(c.created_at) as last_updated,
				MAX(c.escalate) as escalated,
				(SELECT intent FROM conversations c2 WHERE c2.conversation_id = c.conversation_id AND c2.intent IS NOT NULL ORDER BY created_at DESC LIMIT 1) as last_intent,
				(SELECT summary FROM session_summaries s WHERE s.session_id = c.conversation_id) as session_summary
			FROM conversations c
			GROUP BY c.conversation_id
			ORDER BY last_updated DESC
		"""
		with get_connection() as conn:
			with conn.cursor() as cur:
				cur.execute(query)
				rows = cur.fetchall()

		return [dict(row) for row in rows]

	def get_collected_data(self) -> List[Dict[str, Any]]:
		query = """
			SELECT id, session_id, key, value, created_at
			FROM collected_data
			ORDER BY created_at DESC
		"""
		with get_connection() as conn:
			with conn.cursor() as cur:
				cur.execute(query)
				rows = cur.fetchall()
		
		return [dict(row) for row in rows]
		
	def get_auth_codes(self) -> List[Dict[str, Any]]:
		query = """
			SELECT id, email, code, created_at
			FROM user_auth_codes
			ORDER BY created_at DESC
		"""
		with get_connection() as conn:
			with conn.cursor() as cur:
				cur.execute(query)
				rows = cur.fetchall()
			
		return [dict(row) for row in rows]

	def delete_conversation(self, conversation_id: str) -> bool:
		query_conv = "DELETE FROM conversations WHERE conversation_id = %s"
		query_summary = "DELETE FROM session_summaries WHERE session_id = %s"
		with get_connection() as conn:
			with conn.cursor() as cur:
				cur.execute(query_conv, (conversation_id,))
				cur.execute(query_summary, (conversation_id,))
			conn.commit()
		return True

	def delete_all_conversations(self) -> bool:
		query_conv = "DELETE FROM conversations"
		query_summary = "DELETE FROM session_summaries"
		with get_connection() as conn:
			with conn.cursor() as cur:
				cur.execute(query_conv)
				cur.execute(query_summary)
			conn.commit()
		return True

	def get_token_usage_summary(self) -> Dict[str, Any]:
		query = """
			SELECT 
				model_name,
				SUM(input_tokens) as total_input_tokens,
				SUM(output_tokens) as total_output_tokens,
				SUM(duration_seconds) as total_duration_seconds
			FROM token_usage
			GROUP BY model_name
		"""
		try:
			with get_connection() as conn:
				with conn.cursor() as cur:
					cur.execute(query)
					rows = cur.fetchall()
		except Exception as e:
			print(f"Failed to fetch token usage (did you run the migration?): {e}")
			rows = []
				
		total_input_tokens = 0
		total_output_tokens = 0
		total_cost = 0.0
		total_duration = 0.0
		
		# Pricing matrix per 1 million tokens (USD)
		pricing_matrix = {
			"gemini-3.1-flash-lite": {"input": 0.25, "output": 1.50},
			"gemini-3.1-flash-live-preview": {"input": 0.075, "output": 0.30}, 
			"gemini-1.5-flash": {"input": 0.075, "output": 0.30},
			"default": {"input": 0.075, "output": 0.30}
		}

		for row in rows:
			model = row['model_name'] or "default"
			model_key = model.replace("models/", "")
			
			inp = row['total_input_tokens'] or 0
			out = row['total_output_tokens'] or 0
			dur = row.get('total_duration_seconds') or 0.0
			
			total_input_tokens += inp
			total_output_tokens += out
			total_duration += float(dur)
			
			rates = pricing_matrix.get(model_key, pricing_matrix["default"])
			total_cost += (inp / 1_000_000 * rates["input"]) + (out / 1_000_000 * rates["output"])
		
		cost_per_minute = 0.0
		if total_duration > 0:
			cost_per_minute = (total_cost / total_duration) * 60

		return {
			"total_input_tokens": total_input_tokens,
			"total_output_tokens": total_output_tokens,
			"total_duration_seconds": round(total_duration, 2),
			"total_cost_usd": round(total_cost, 6),
			"cost_per_minute_usd": round(cost_per_minute, 6)
		}

	def reset_token_usage(self) -> bool:
		query = "DELETE FROM token_usage"
		with get_connection() as conn:
			with conn.cursor() as cur:
				cur.execute(query)
			conn.commit()
		return True

admin_store = AdminStore()
