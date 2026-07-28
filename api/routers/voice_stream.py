import json
import base64
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import websockets
from websockets.exceptions import ConnectionClosed
from datetime import datetime

from agent.config import GEMINI_API_KEY, GEMINI_LIVE_MODEL
from agent.nodes import _build_system_prompt
from agent.live_tools import LIVE_TOOL_DECLARATIONS, LIVE_TOOLS_MAP
from api.store import conversation_store
from api.schemas import ConversationMessage

router = APIRouter(prefix="/voice", tags=["voice_stream"])

# Ensure model format
if not GEMINI_LIVE_MODEL.startswith("models/"):
    formatted_model = f"models/{GEMINI_LIVE_MODEL}"
else:
    formatted_model = GEMINI_LIVE_MODEL

GEMINI_WS_URL = f"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key={GEMINI_API_KEY}"

@router.websocket("/ws/{conversation_id}")
async def voice_websocket_endpoint(websocket: WebSocket, conversation_id: str):
    await websocket.accept()

    if not GEMINI_API_KEY:
        await websocket.send_json({"error": "GEMINI_API_KEY is not configured"})
        await websocket.close()
        return

    # Fetch context summary to inject into system instruction
    session_summary = conversation_store.get_session_summary(conversation_id)
    system_prompt = _build_system_prompt(session_summary)

    try:
        async with websockets.connect(GEMINI_WS_URL) as gemini_ws:
            # 1. Send Setup Message
            setup_message = {
                "setup": {
                    "model": formatted_model,
                    "generationConfig": {
                        "responseModalities": ["AUDIO"],
                    },
                    "systemInstruction": {
                        "parts": [{"text": system_prompt}]
                    },
                    "tools": [{"functionDeclarations": LIVE_TOOL_DECLARATIONS}]
                }
            }
            print(f"Sending setup with model: {formatted_model}")
            await gemini_ws.send(json.dumps(setup_message))

            # Receive the setup response
            setup_response = await gemini_ws.recv()
            print("Setup response:", setup_response)

            # Start proxying
            client_to_gemini_task = asyncio.create_task(proxy_client_to_gemini(websocket, gemini_ws))
            gemini_to_client_task = asyncio.create_task(proxy_gemini_to_client(websocket, gemini_ws, conversation_id))

            done, pending = await asyncio.wait(
                [client_to_gemini_task, gemini_to_client_task],
                return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()

    except WebSocketDisconnect:
        print(f"Client disconnected from WS for conversation {conversation_id}")
    except Exception as e:
        print(f"Error in voice websocket: {str(e)}")
    finally:
        try:
            await websocket.close()
        except:
            pass


async def proxy_client_to_gemini(client_ws: WebSocket, gemini_ws):
    """Reads audio chunks from the browser and sends realtimeInput to Gemini."""
    try:
        while True:
            # Expecting base64 string or JSON
            message = await client_ws.receive_text()
            try:
                data = json.loads(message)
                if "realtimeInput" in data:
                    # Forward structured realtime input
                    await gemini_ws.send(message)
                elif "audioB64" in data:
                    # Construct realtimeInput if client just sends raw b64
                    payload = {
                        "realtimeInput": {
                            "audio": {
                                "data": data["audioB64"],
                                "mimeType": "audio/pcm;rate=16000"
                            }
                        }
                    }
                    await gemini_ws.send(json.dumps(payload))
            except json.JSONDecodeError:
                # If they just sent bare text, they might have sent base64 directly
                payload = {
                    "realtimeInput": {
                        "audio": {
                            "data": message,
                            "mimeType": "audio/pcm;rate=16000"
                        }
                    }
                }
                await gemini_ws.send(json.dumps(payload))

    except Exception as e:
        print("client_to_gemini exception:", str(e))


async def proxy_gemini_to_client(client_ws: WebSocket, gemini_ws, conversation_id: str):
    """Reads from Gemini and routes audio/text to client, and handles tool calls."""
    try:
        while True:
            response_str = await gemini_ws.recv()
            data = json.loads(response_str)

            if "serverContent" in data:
                server_content = data["serverContent"]
                
                # Signal interruption
                if server_content.get("interrupted"):
                    await client_ws.send_json({"interrupted": True})

                if "modelTurn" in server_content:
                    parts = server_content["modelTurn"].get("parts", [])
                    for part in parts:
                        # Forward audio back to frontend
                        if "inlineData" in part:
                            # e.g., audio/pcm
                            await client_ws.send_json({
                                "audioB64": part["inlineData"]["data"]
                            })
                        
                        # Forward text and log to DB if present
                        if "text" in part:
                            text_content = part["text"]
                            await client_ws.send_json({"text": text_content})
                            # Optionally append to conversation store so it appears in text UI later
                            msg = ConversationMessage(role="assistant", content=text_content)
                            conversation_store.append(conversation_id, msg)

            elif "toolCall" in data:
                function_calls = data["toolCall"]["functionCalls"]
                responses = []

                for fc in function_calls:
                    f_name = fc["name"]
                    f_id = fc["id"]
                    f_args = fc.get("args", {})
                    
                    if f_name in ["save_collected_information", "send_verification_email"]:
                        f_args["session_id"] = conversation_id
                    
                    print(f"Executing tool {f_name} with {f_args}")
                    
                    result = ""
                    if f_name in LIVE_TOOLS_MAP:
                        try:
                            result = LIVE_TOOLS_MAP[f_name](f_args)
                        except Exception as e:
                            result = f"Error: {str(e)}"
                    else:
                        result = "Unknown tool."
                    
                    responses.append({
                        "id": f_id,
                        "name": f_name,
                        "response": {"result": str(result)}
                    })

                # Send tool response back to Gemini
                tool_resp = {
                    "toolResponse": {
                        "functionResponses": responses
                    }
                }
                await gemini_ws.send(json.dumps(tool_resp))

    except Exception as e:
        print("gemini_to_client exception:", str(e))
