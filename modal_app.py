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
        "mediainfo",
        "imagemagick",
        "libmagic1",
        "wget",
    )
    .run_commands(
        # Install Node.js (latest LTS)
        "curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -",
        "apt-get install -y nodejs",
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
    )
    # Copy package.json files first (for dependency caching)
    .add_local_file("server/package.json", "/app/server/package.json", copy=True)
    .add_local_file("client/package.json", "/app/client/package.json", copy=True)
    .add_local_file("client/vite.config.js", "/app/client/vite.config.js", copy=True)
    .add_local_file("client/tailwind.config.js", "/app/client/tailwind.config.js", copy=True)
    .add_local_file("client/postcss.config.js", "/app/client/postcss.config.js", copy=True)
    .add_local_file("client/index.html", "/app/client/index.html", copy=True)
    # Install dependencies during image build
    .run_commands(
        "cd /app/server && npm install",
        "cd /app/client && npm install",
    )
    # Add source code (changes here won't re-run npm install)
    .add_local_dir("server/src", remote_path="/app/server/src")
    .add_local_dir("client/src", remote_path="/app/client/src")
)

app = modal.App("video-library", image=image)


@app.function(
    timeout=86400,
    volumes={"/data": volume},
)
def run():
    os.chdir("/app")
    
    # Ensure data directories exist
    os.makedirs("/data/videos", exist_ok=True)
    os.makedirs("/data/thumbnails", exist_ok=True)
    os.makedirs("/data/db", exist_ok=True)
    
    # Build client (source code may have changed)
    print("Building client...")
    subprocess.run(["npm", "run", "build"], cwd="/app/client", check=True)
    
    # Start Node server in background
    print("Starting server...")
    node_proc = subprocess.Popen(
        ["npm", "run", "start"],
        cwd="/app/server",
    )
    
    # Expose via cloudflare tunnel
    print("Starting cloudflare tunnel...")
    subprocess.run(["cloudflared", "tunnel", "--url", "http://localhost:3000"])
    
    node_proc.terminate()


@app.local_entrypoint()
def main():
    run.remote()
