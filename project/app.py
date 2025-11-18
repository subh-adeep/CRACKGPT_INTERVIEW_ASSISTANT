# app.py (top portion unchanged)
import os
import sys
import socket
from flask import Flask, send_from_directory
from flask_cors import CORS

# add socketio
from flask_socketio import SocketIO

from routes.interview_routes import interview_bp
from routes.coding_routes import coding_bp
from routes.debug_routes import debug_bp
# after registering blueprints, import websocket routes to register handlers
# ensure this import is after socketio is created if you prefer; here it's fine
import routes.ws_routes  # registers socketio handlers


# Initialize Flask app
app = Flask(__name__, static_url_path="", static_folder="static")
CORS(app)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

# Register blueprints
app.register_blueprint(interview_bp)
app.register_blueprint(coding_bp)
app.register_blueprint(debug_bp)

# --- SocketIO setup ---
# Use message_queue/async_mode settings for production as needed.
# For local dev, eventlet works fine if installed.
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

@app.route("/")
def root():
    return send_from_directory("static", "home.html")

@app.route("/setup")
def setup_page():
    return send_from_directory("static", "setup.html")

@app.route("/interview")
def interview_page():
    return send_from_directory("static", "interview.html")

@app.route("/results")
def results_page():
    return send_from_directory("static", "results.html")

@app.route("/permissions")
def permissions_page():
    return send_from_directory("static", "permissions.html")


if __name__ == "__main__":
    def _pick_port(default_port: int) -> int:
        env_port = os.getenv("PORT")
        cli_port = None
        for a in sys.argv[1:]:
            if a.startswith("--port="):
                try:
                    cli_port = int(a.split("=", 1)[1])
                except Exception:
                    cli_port = None
        base = None
        if cli_port:
            base = cli_port
        elif env_port:
            try:
                base = int(env_port)
            except Exception:
                base = default_port
        else:
            base = default_port
        for p in range(base, base + 20):
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                s.bind(("0.0.0.0", p))
                s.close()
                return p
            except Exception:
                try:
                    s.close()
                except Exception:
                    pass
        return base

    port = _pick_port(8000)
    socketio.run(app, host="0.0.0.0", port=port, debug=False)
