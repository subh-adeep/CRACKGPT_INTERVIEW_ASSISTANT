# routes/ws_routes.py
from flask import current_app
from flask_socketio import emit, join_room, leave_room
from app import socketio  # import the socketio instance we created in app.py
import logging

logger = logging.getLogger(__name__)

@socketio.on("connect")
def handle_connect():
    logger.info("WS client connected")
    emit("server_message", {"msg": "connected"})

@socketio.on("disconnect")
def handle_disconnect():
    logger.info("WS client disconnected")

@socketio.on("join")
def handle_join(data):
    # optional room support
    room = data.get("room")
    if room:
        join_room(room)
    emit("server_message", {"msg": f"joined room {room}"})


@socketio.on("client_audio_chunk")
def handle_client_audio_chunk(data):
    """
    Receives binary audio chunks or base64 strings from client.
    For testing, we echo back a small acknowledgement.
    Later we will forward these bytes to streaming STT.
    """
    try:
        # data may be binary (bytes) or JSON; SocketIO will pass bytes if client sends ArrayBuffer
        # For now we just log and ack
        size = len(data) if data else 0
        logger.info("Received audio chunk size=%d", size)
        # send ack back
        emit("ack", {"ok": True, "bytes": size})
    except Exception as e:
        logger.exception("Error handling audio chunk")
        emit("ack", {"ok": False, "error": str(e)})
