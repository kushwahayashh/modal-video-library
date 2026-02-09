import modal
import subprocess
import os

# Persistent volume for videos and data
volume = modal.Volume.from_name("video-library-data", create_if_missing=True)

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
        # Install gallery-dl
        "pip install gallery-dl",
    )
    .pip_install(
        "ffmpeg-python",
        "python-magic",
        "Pillow",
        "mutagen",
        "fastapi[standard]",
    )
    # Copy package.json files first (for dependency caching)
    .add_local_file("server/package.json", "/app/server/package.json", copy=True)
    .add_local_file("client/package.json", "/app/client/package.json", copy=True)
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

app = modal.App("video-library", image=image)

# Store the cloudflare URL
cf_url_store = modal.Dict.from_name("cf-url-store", create_if_missing=True)


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
    
    os.chdir("/app")
    
    # Ensure data directories exist
    os.makedirs("/data/.home", exist_ok=True)
    os.makedirs("/data/videos", exist_ok=True)
    os.makedirs("/data/thumbnails", exist_ok=True)
    os.makedirs("/data/db", exist_ok=True)
    
    print("\n  \033[1mVIDEOLIB\033[0m starting...\n")

    # Start tunnel
    print("  Starting tunnel...", end=" ", flush=True)
    tunnel_ready = threading.Event()
    server_ready = threading.Event()
    cf_url_holder = {"url": None}

    cf_proc = subprocess.Popen(
        ["cloudflared", "tunnel", "--url", "http://localhost:3000"],
        stderr=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
    )

    def push_cf_url(url):
        for _ in range(20):
            if server_ready.is_set():
                try:
                    data = json.dumps({"url": url}).encode("utf-8")
                    req = urllib.request.Request(
                        "http://localhost:3000/api/cf-url",
                        data=data,
                        headers={"Content-Type": "application/json"},
                    )
                    urllib.request.urlopen(req, timeout=5)
                    return
                except Exception:
                    time.sleep(0.5)
            else:
                time.sleep(0.2)

    def capture_cf_url(proc):
        url_found = False
        for line in iter(proc.stderr.readline, b""):
            line_str = line.decode("utf-8", errors="ignore")
            match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line_str)
            if match and not url_found:
                url_found = True
                cf_url = match.group(0)
                print(f"\033[32mdone\033[0m")
                print(f"\n  \033[1mPublic URL:\033[0m \033[36m{cf_url}\033[0m\n")
                cf_url_store["url"] = cf_url
                cf_url_holder["url"] = cf_url
                tunnel_ready.set()
                push_cf_url(cf_url)

    capture_thread = threading.Thread(target=capture_cf_url, args=(cf_proc,), daemon=True)
    capture_thread.start()

    # Build client in parallel with tunnel startup
    build_done = threading.Event()
    build_error = {"err": None}

    def build_client():
        try:
            subprocess.run(
                ["bun", "run", "build"],
                cwd="/app/client",
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
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
        print("  Building client...", end=" ", flush=True)
        build_done.wait()
        if build_error["err"]:
            print("\033[31mfailed\033[0m")
            raise build_error["err"]
        print("\033[32mdone\033[0m")
    else:
        if build_error["err"]:
            raise build_error["err"]

    # Start server
    print("  Starting server...", end=" ", flush=True)
    server_proc = subprocess.Popen(
        ["bun", "run", "start"],
        cwd="/app/server",
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )

    for line in iter(server_proc.stdout.readline, b""):
        line_str = line.decode("utf-8", errors="ignore").rstrip()
        if line_str:
            break
    print("\033[32mdone\033[0m")
    server_ready.set()

    if tunnel_ready.is_set() and cf_url_holder["url"]:
        push_cf_url(cf_url_holder["url"])

    def pipe_server_output(proc):
        for line in iter(proc.stdout.readline, b""):
            line_str = line.decode("utf-8", errors="ignore").rstrip()
            if line_str:
                print(f"  {line_str}")

    server_thread = threading.Thread(target=pipe_server_output, args=(server_proc,), daemon=True)
    server_thread.start()

    cf_proc.wait()
    server_proc.terminate()


@app.function()
@modal.fastapi_endpoint(method="GET")
def get_cf_url():
    """Web endpoint that redirects to the Cloudflare tunnel URL"""
    from fastapi.responses import RedirectResponse, JSONResponse
    
    try:
        url = cf_url_store.get("url")
        if url:
            return RedirectResponse(url=url, status_code=302)
        else:
            return JSONResponse(
                {"error": "Cloudflare URL not set. Is the tunnel running?"},
                status_code=404
            )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.function()
@modal.fastapi_endpoint(method="GET")
def cf_url_json():
    """Get the Cloudflare URL as JSON"""
    from fastapi.responses import JSONResponse
    
    try:
        url = cf_url_store.get("url")
        if url:
            return JSONResponse({"url": url})
        else:
            return JSONResponse({"error": "Not set"}, status_code=404)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.local_entrypoint()
def main():
    run.remote()
