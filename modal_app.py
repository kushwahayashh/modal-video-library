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
)

app = modal.App("video-library", image=image)

# Store the cloudflare URL
cf_url_store = modal.Dict.from_name("cf-url-store", create_if_missing=True)


@app.function(
    timeout=86400,
    volumes={"/data": volume},
)
def run():
    import re
    import threading
    import time
    import urllib.request
    import json
    
    os.chdir("/app")
    
    # Ensure data directories exist
    os.makedirs("/data/videos", exist_ok=True)
    os.makedirs("/data/thumbnails", exist_ok=True)
    os.makedirs("/data/db", exist_ok=True)
    
    # Build client (source code may have changed)
    print("Building client...")
    subprocess.run(["bun", "run", "build"], cwd="/app/client", check=True)
    
    # Start server in background
    print("Starting server...")
    server_proc = subprocess.Popen(
        ["bun", "run", "start"],
        cwd="/app/server",
    )
    
    # Wait for server to start
    time.sleep(2)
    
    # Function to capture cloudflared URL and store it
    def capture_cf_url(proc):
        for line in iter(proc.stderr.readline, b''):
            line_str = line.decode('utf-8', errors='ignore')
            print(line_str, end='')
            
            # Look for trycloudflare.com URL
            match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line_str)
            if match:
                cf_url = match.group(0)
                print(f"\n>>> Cloudflare URL captured: {cf_url}\n")
                
                # Store in Modal Dict
                cf_url_store["url"] = cf_url
                
                # Also register with the local server
                try:
                    data = json.dumps({"url": cf_url}).encode('utf-8')
                    req = urllib.request.Request(
                        "http://localhost:3000/api/cf-url",
                        data=data,
                        headers={"Content-Type": "application/json"}
                    )
                    urllib.request.urlopen(req, timeout=5)
                    print(">>> URL registered with server")
                except Exception as e:
                    print(f">>> Failed to register URL: {e}")
    
    # Start cloudflare tunnel
    print("Starting cloudflare tunnel...")
    cf_proc = subprocess.Popen(
        ["cloudflared", "tunnel", "--url", "http://localhost:3000"],
        stderr=subprocess.PIPE,
        stdout=subprocess.PIPE,
    )
    
    # Start URL capture thread
    capture_thread = threading.Thread(target=capture_cf_url, args=(cf_proc,), daemon=True)
    capture_thread.start()
    
    # Wait for tunnel process
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
