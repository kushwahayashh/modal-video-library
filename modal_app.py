import modal
import subprocess
import os

# Persistent volume for videos and data
volume = modal.Volume.from_name("video-library-data", create_if_missing=True)

APP_NAME = "video-library"
APP_ROOT = "/app"
SERVER_PORT = 3000
HEALTH_URL = f"http://localhost:{SERVER_PORT}/api/health"


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
        "npm i -g @openai/codex @qwen-code/qwen-code",
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
    .add_local_file("server/package-lock.json", "/app/server/package-lock.json", copy=True)
    .add_local_file("client/package.json", "/app/client/package.json", copy=True)
    .add_local_file("client/package-lock.json", "/app/client/package-lock.json", copy=True)
    .add_local_file("client/vite.config.js", "/app/client/vite.config.js", copy=True)
    .add_local_file("client/index.html", "/app/client/index.html", copy=True)
    # Install dependencies during image build (bun handles native modules)
    .run_commands(
        "cd /app/server && bun install",
        "cd /app/client && bun install",
    )
    # Add source code (changes here won't re-run npm install)
    .add_local_dir("server/src", remote_path="/app/server/src")
    .add_local_dir("client/src", remote_path="/app/client/src")
    .add_local_dir("images", remote_path="/app/images")
)

app = modal.App(APP_NAME, image=image)

# Store the cloudflare URL
cf_url_store = modal.Dict.from_name("cf-url-store", create_if_missing=True)

def _read_cf_url():
    try:
        return cf_url_store.get("url"), None
    except Exception as e:
        return None, e


@app.function(
    timeout=86400,
    volumes={"/data": volume},
    env={"HOME": "/data/.home"},
)
def run():
    import re
    import threading
    import time
    import urllib.request
    import json

    cf_url_store.pop("url", None)

    # Ensure data directories exist
    def ensure_dirs():
        os.makedirs("/data/.home", exist_ok=True)
        os.makedirs("/data/videos", exist_ok=True)
        os.makedirs("/data/thumbnails", exist_ok=True)
        os.makedirs("/data/db", exist_ok=True)

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

    print_lock = threading.Lock()

    def log(message=""):
        with print_lock:
            print(message, flush=True)

    ensure_dirs()
    log("\n  \033[1mVIDEOLIB\033[0m starting...\n")

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

    capture_thread = threading.Thread(target=capture_cf_url, args=(cf_proc,), daemon=True)
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
    tunnel_ready.wait(timeout=15)

    # Then wait for build to finish
    if not build_done.is_set():
        build_done.wait()

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
        server_ready.set()
        maybe_post_cf_url()
    else:
        log(f"  Starting server... \033[31mfailed\033[0m")
        raise RuntimeError("Server did not become healthy in time.")

    def pipe_server_output():
        for line in server_proc.stdout:
            line_str = line.rstrip()
            if line_str:
                log(f"  {line_str}")

    server_thread = threading.Thread(target=pipe_server_output, daemon=True)
    server_thread.start()

    try:
        while True:
            if cf_proc.poll() is not None or server_proc.poll() is not None:
                break
            time.sleep(1)
    finally:
        terminate_process(server_proc)
        terminate_process(cf_proc)


@app.function()
@modal.fastapi_endpoint(method="GET")
def get_cf_url():
    """Web endpoint that redirects to the Cloudflare tunnel URL"""
    from fastapi.responses import RedirectResponse, JSONResponse
    
    url, err = _read_cf_url()
    if err:
        return JSONResponse({"error": str(err)}, status_code=500)
    if url:
        return RedirectResponse(url=url, status_code=302)
    return JSONResponse(
        {"error": "Cloudflare URL not set. Is the tunnel running?"},
        status_code=404
    )


@app.function()
@modal.fastapi_endpoint(method="GET")
def cf_url_json():
    """Get the Cloudflare URL as JSON"""
    from fastapi.responses import JSONResponse
    
    url, err = _read_cf_url()
    if err:
        return JSONResponse({"error": str(err)}, status_code=500)
    if url:
        return JSONResponse({"url": url})
    return JSONResponse({"error": "Not set"}, status_code=404)


@app.local_entrypoint()
def main():
    run.remote()
