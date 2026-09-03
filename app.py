import modal
import subprocess
import os
import time

# Persistent volume for videos and data
volume = modal.Volume.from_name("video-library-data", create_if_missing=True)

APP_NAME = "luna"
APP_ROOT = "/app"
SERVER_PORT = 3000
HEALTH_URL = f"http://localhost:{SERVER_PORT}/api/health"
RUNTIME_STATUS_URL = f"http://localhost:{SERVER_PORT}/api/runtime/status"
IDLE_TIMEOUT_SECONDS = 2 * 60 * 60
IDLE_POLL_INTERVAL_SECONDS = 60
RUN_HEARTBEAT_TTL_SECONDS = 15
START_LOCK_TTL_SECONDS = 20 * 60
START_LOCK_GRACE_SECONDS = 60


image = (
    modal.Image.debian_slim()
    .apt_install(
        "ffmpeg",
        "aria2",
        "curl",
        "unzip",
        "mediainfo",
        "imagemagick",
        "libmagic1",
        "wget",
    )
    .run_commands(
        # Install Node.js + npm
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
        "npm i -g @openai/codex @qwen-code/qwen-code @sourcegraph/amp @mariozechner/pi-coding-agent",
        # Install Bun
        "curl -fsSL https://bun.sh/install | bash",
        "ln -s /root/.bun/bin/bun /usr/local/bin/bun",
        "ln -s /root/.bun/bin/bunx /usr/local/bin/bunx",
        # Install yt-dlp
        "curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp",
        "chmod a+rx /usr/local/bin/yt-dlp",
        # Install cloudflared
        "curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared",
        "chmod a+rx /usr/local/bin/cloudflared",
    )
    .pip_install(
        "gallery-dl",
        "ffmpeg-python",
        "python-magic",
        "Pillow",
        "mutagen",
        "fastapi[standard]",
    )
    # Copy package.json files first (for dependency caching)
    .add_local_file("server/package.json", "/app/server/package.json", copy=True)
    .add_local_file(
        "server/package-lock.json", "/app/server/package-lock.json", copy=True
    )
    .add_local_file("client/package.json", "/app/client/package.json", copy=True)
    .add_local_file(
        "client/package-lock.json", "/app/client/package-lock.json", copy=True
    )
    .add_local_file("client/vite.config.js", "/app/client/vite.config.js", copy=True)
    .add_local_file("client/index.html", "/app/client/index.html", copy=True)
    # Install dependencies during image build (bun handles native modules)
    .run_commands(
        "cd /app/server && bun install",
        "cd /app/client && bun install",
    )
    .add_local_file("redirect.html", "/app/redirect.html", copy=True)
    # Add source code (changes here won't re-run npm install)
    .add_local_dir("server/src", remote_path="/app/server/src")
    .add_local_dir("client/src", remote_path="/app/client/src")
)

app = modal.App(APP_NAME, image=image)

# Store runtime state and cloudflare URL
cf_url_store = modal.Dict.from_name("cf-url-store", create_if_missing=True)


def _read_runtime_state():
    try:
        return {
            "url": cf_url_store.get("url"),
            "status": cf_url_store.get("status"),
            "heartbeat": cf_url_store.get("heartbeat"),
            "launching": cf_url_store.get("launching"),
        }, None
    except Exception as e:
        return None, e


def _is_run_alive(state, now_ts=None):
    heartbeat = state.get("heartbeat")
    if not isinstance(heartbeat, (int, float)):
        return False
    now_ts = now_ts if now_ts is not None else time.time()
    return (now_ts - heartbeat) <= RUN_HEARTBEAT_TTL_SECONDS


def _has_live_url(state, now_ts=None):
    return bool(state.get("url")) and _is_run_alive(state, now_ts)


def _is_redirect_ready(state, now_ts=None):
    return _has_live_url(state, now_ts) and state.get("status") == "running"


def _no_cache_headers():
    return {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
    }


def _load_redirect_template():
    for p in [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "redirect.html"),
        "/app/redirect.html",
    ]:
        try:
            with open(p, "r", encoding="utf-8") as f:
                return f.read()
        except FileNotFoundError:
            continue
    raise FileNotFoundError("redirect.html not found")


_REDIRECT_TEMPLATE = _load_redirect_template()


def _tunnel_redirect_page(tunnel_url: str, poll_url: str):
    from fastapi.responses import HTMLResponse

    html = _REDIRECT_TEMPLATE.replace("{{TUNNEL_URL}}", tunnel_url).replace(
        "{{POLL_URL}}", poll_url
    )
    return HTMLResponse(content=html, headers=_no_cache_headers())


@app.function(
    timeout=86400,
    volumes={"/data": volume},
    env={"HOME": "/data/.home", "PI_OFFLINE": "1"},
    secrets=[modal.Secret.from_name("gemini-key")],
)
def run():
    import re
    import threading
    import urllib.request
    import json

    cf_url_store.pop("url", None)
    start_ts = time.time()
    cf_url_store["status"] = "starting"
    cf_url_store["heartbeat"] = start_ts
    if not isinstance(cf_url_store.get("launching"), (int, float)):
        cf_url_store["launching"] = start_ts

    # Ensure data directories exist
    def ensure_dirs():
        os.makedirs("/data/.home", exist_ok=True)
        os.makedirs("/data/videos", exist_ok=True)
        os.makedirs("/data/thumbnails", exist_ok=True)


    def wait_for_health(url, timeout=30, interval=0.5):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(url, timeout=3) as resp:
                    if resp.status == 200:
                        return True
            except Exception:
                time.sleep(interval)
        return False

    def post_cf_url(url, attempts=20, delay=0.5):
        data = json.dumps({"url": url}).encode("utf-8")
        req = urllib.request.Request(
            f"http://localhost:{SERVER_PORT}/api/cf-url",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        for _ in range(attempts):
            try:
                urllib.request.urlopen(req, timeout=5)
                return True
            except Exception:
                time.sleep(delay)
        return False

    def terminate_process(proc):
        if not proc or proc.poll() is not None:
            return
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    def fetch_runtime_status():
        req = urllib.request.Request(
            RUNTIME_STATUS_URL,
            headers={"x-idle-watchdog": "1"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status != 200:
                return None
            data = json.loads(resp.read().decode("utf-8"))
            if not isinstance(data, dict):
                return None
            return data

    print_lock = threading.Lock()

    def log(message=""):
        with print_lock:
            print(message, flush=True)

    ensure_dirs()
    log("\n  \033[1mLUNA\033[0m starting...\n")

    tunnel_ready = threading.Event()
    server_ready = threading.Event()
    cf_state = {"url": None, "posted": False}

    def maybe_post_cf_url():
        if cf_state["posted"] or not cf_state["url"] or not server_ready.is_set():
            return
        cf_state["posted"] = post_cf_url(cf_state["url"])

    # Start tunnel
    log("  Starting tunnel...")
    cf_proc = subprocess.Popen(
        ["cloudflared", "tunnel", "--url", f"http://localhost:{SERVER_PORT}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    def capture_cf_url(proc):
        url_found = False
        for line in iter(proc.stdout.readline, ""):
            match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
            if match and not url_found:
                url_found = True
                cf_url = match.group(0)
                log(f"  Starting tunnel... \033[32mdone\033[0m")
                log(f"\n  \033[1mPublic URL:\033[0m \033[36m{cf_url}\033[0m\n")
                cf_url_store["url"] = cf_url
                cf_state["url"] = cf_url
                tunnel_ready.set()
                maybe_post_cf_url()
        if not url_found:
            log(f"  Starting tunnel... \033[31mfailed\033[0m")
            tunnel_ready.set()

    capture_thread = threading.Thread(
        target=capture_cf_url, args=(cf_proc,), daemon=True
    )
    capture_thread.start()

    # Build client in parallel with tunnel startup
    build_done = threading.Event()
    build_error = {"err": None, "stderr": None}

    def build_client():
        try:
            result = subprocess.run(
                ["bun", "run", "build"],
                cwd=f"{APP_ROOT}/client",
                check=True,
                capture_output=True,
                text=True,
            )
            if result.stderr:
                build_error["stderr"] = result.stderr
        except subprocess.CalledProcessError as e:
            build_error["err"] = e
            build_error["stderr"] = e.stderr or e.stdout
        except Exception as e:
            build_error["err"] = e
        finally:
            build_done.set()

    build_thread = threading.Thread(target=build_client, daemon=True)
    build_thread.start()

    # Wait for tunnel URL first (up to 15s)
    tunnel_deadline = time.time() + 15
    while time.time() < tunnel_deadline and not tunnel_ready.is_set():
        cf_url_store["heartbeat"] = time.time()
        tunnel_ready.wait(timeout=1)

    # Then wait for build to finish
    while not build_done.is_set():
        cf_url_store["heartbeat"] = time.time()
        build_done.wait(timeout=1)

    if build_error["err"]:
        log(f"  Building client... \033[31mfailed\033[0m")
        if build_error["stderr"]:
            log(build_error["stderr"].rstrip())
        raise build_error["err"]

    log(f"  Building client... \033[32mdone\033[0m")

    # Start server
    log("  Starting server...")
    server_proc = subprocess.Popen(
        ["bun", "run", "start"],
        cwd=f"{APP_ROOT}/server",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    if wait_for_health(HEALTH_URL, timeout=30):
        log(f"  Starting server... \033[32mdone\033[0m")
        cf_url_store["status"] = "running"
        cf_url_store["heartbeat"] = time.time()
        cf_url_store.pop("launching", None)
        server_ready.set()
        maybe_post_cf_url()
    else:
        log(f"  Starting server... \033[31mfailed\033[0m")
        cf_url_store["status"] = "failed"
        cf_url_store.pop("launching", None)
        raise RuntimeError("Server did not become healthy in time.")

    def pipe_server_output():
        for line in server_proc.stdout:
            line_str = line.rstrip()
            if line_str:
                log(f"  {line_str}")

    server_thread = threading.Thread(target=pipe_server_output, daemon=True)
    server_thread.start()

    last_idle_check = 0.0

    try:
        while True:
            if cf_proc.poll() is not None or server_proc.poll() is not None:
                break
            now_ts = time.time()
            cf_url_store["heartbeat"] = now_ts

            if now_ts - last_idle_check >= IDLE_POLL_INTERVAL_SECONDS:
                last_idle_check = now_ts
                try:
                    runtime_status = fetch_runtime_status()
                    if runtime_status:
                        terminal_count = int(
                            runtime_status.get("terminalConnectionCount", 0) or 0
                        )
                        active_jobs = int(
                            runtime_status.get("activeSpriteJobs", 0) or 0
                        )
                        active_downloads = int(
                            runtime_status.get("activeDownloads", 0) or 0
                        )
                        last_activity_ms = runtime_status.get("lastActivityAt")
                        last_activity_ts = (
                            float(last_activity_ms) / 1000.0
                            if isinstance(last_activity_ms, (int, float))
                            else now_ts
                        )
                        idle_for = max(0.0, now_ts - last_activity_ts)

                        if (
                            terminal_count <= 0
                            and active_jobs <= 0
                            and active_downloads <= 0
                            and idle_for >= IDLE_TIMEOUT_SECONDS
                        ):
                            log("  Idle timeout reached (2h). Stopping app...")
                            break
                except Exception:
                    # Keep running if status probe fails temporarily.
                    pass

            time.sleep(1)
    finally:
        terminate_process(server_proc)
        terminate_process(cf_proc)
        cf_url_store.pop("url", None)
        cf_url_store.pop("heartbeat", None)
        cf_url_store.pop("launching", None)
        cf_url_store["status"] = "stopped"


@app.function()
@modal.fastapi_endpoint(method="GET")
def launch(fmt: str = ""):
    """Auto-start run() if needed, then redirect to the Cloudflare tunnel URL.
    Append ?fmt=json to poll status without the HTML page."""
    from fastapi.responses import JSONResponse

    poll_url = launch.get_web_url() + "?fmt=json"
    wants_json = fmt.lower() == "json"

    state, err = _read_runtime_state()
    if err:
        return JSONResponse(
            {"error": str(err)}, status_code=500, headers=_no_cache_headers()
        )

    now_ts = time.time()

    if _is_redirect_ready(state, now_ts):
        if wants_json:
            return JSONResponse(
                {"url": state["url"], "status": "running"},
                headers=_no_cache_headers(),
            )
        return _tunnel_redirect_page(state["url"], poll_url)

    if state.get("url") and not _has_live_url(state, now_ts):
        cf_url_store.pop("url", None)

    # If a previous launch failed, clear lock so retries can spawn immediately
    if state.get("status") == "failed" and not _is_run_alive(state, now_ts):
        cf_url_store.pop("launching", None)

    launch_ts = state.get("launching")
    # If the spawned run is not alive AND the lock is older than the grace
    # period, assume the previous spawn died before heartbeating and clear it.
    if (
        isinstance(launch_ts, (int, float))
        and (now_ts - launch_ts) >= START_LOCK_GRACE_SECONDS
        and not _is_run_alive(state, now_ts)
    ):
        cf_url_store.pop("launching", None)
        launch_ts = None

    launch_lock_active = (
        isinstance(launch_ts, (int, float))
        and (now_ts - launch_ts) < START_LOCK_TTL_SECONDS
    )
    should_spawn = not launch_lock_active and not _is_run_alive(state, now_ts)

    if should_spawn:
        cf_url_store["launching"] = now_ts
        cf_url_store["status"] = "starting"
        cf_url_store.pop("url", None)
        try:
            run.spawn()
        except Exception as e:
            cf_url_store["status"] = "failed"
            cf_url_store.pop("launching", None)
            if wants_json:
                return JSONResponse(
                    {"error": f"Failed to launch app: {e}"},
                    status_code=500,
                    headers=_no_cache_headers(),
                )
            return _tunnel_redirect_page("", poll_url)

    if wants_json:
        return JSONResponse(
            {"status": state.get("status", "starting")},
            status_code=202,
            headers=_no_cache_headers(),
        )

    # Return the redirect page immediately — it polls ?format=json for readiness
    return _tunnel_redirect_page("", poll_url)


@app.local_entrypoint()
def main():
    run.remote()
