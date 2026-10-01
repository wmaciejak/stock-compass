from pathlib import Path
import socket
import signal
import subprocess
import os
import sys
from dotenv import load_dotenv


def main():
    root = Path(__file__).resolve().parents[1]
    os.chdir(root)
    load_dotenv(root / ".env")
    if not (root / "frontend/dist/index.html").exists():
        print("Frontend is not built. Run ./scripts/setup.sh first.")
        return 1
    try:
        port = int(os.environ.get("STOCK_COMPASS_PORT", "8765"))
        if not 1024 <= port <= 65535:
            raise ValueError()
    except ValueError:
        print("STOCK_COMPASS_PORT must be an integer between 1024 and 65535.")
        return 1
    with socket.socket() as sock:
        # Permit immediate restart after closed local connections enter TIME_WAIT.
        # An active listener still prevents this probe from binding the port.
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            print(
                f"Port {port} is in use. Stop that app or run STOCK_COMPASS_PORT=8766 ./scripts/start.sh."
            )
            return 1
    child = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "compass.api:app",
            "--app-dir",
            "backend",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=root,
        start_new_session=True,
    )

    def stop(*_):
        if child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    print(f"Stock Compass → http://127.0.0.1:{port} (Ctrl+C to stop)", flush=True)
    try:
        return child.wait()
    finally:
        stop()
        try:
            child.wait(timeout=8)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()


if __name__ == "__main__":
    sys.exit(main())
