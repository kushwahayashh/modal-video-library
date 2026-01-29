import modal

image = (
    modal.Image.debian_slim()
    .apt_install(
        "ffmpeg",
        "aria2",
        "curl",
        "mediainfo",          # Video metadata extraction
        "imagemagick",        # Thumbnail generation
        "libmagic1",          # File type detection
        "wget",
    )
    .run_commands(
        # Install Node.js (latest LTS)
        "curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -",
        "apt-get install -y nodejs",
        # Install yt-dlp
        "curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp",
        "chmod a+rx /usr/local/bin/yt-dlp",
        # Install cloudflared (trycloudflare)
        "curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared",
        "chmod a+rx /usr/local/bin/cloudflared",
        # Install gallery-dl (for other media sources)
        "pip install gallery-dl",
    )
    .pip_install(
        "ffmpeg-python",      # FFmpeg Python bindings
        "python-magic",       # File type detection
        "Pillow",             # Image processing
        "mutagen",            # Audio/video metadata
    )
)

app = modal.App("my-app", image=image)


@app.function()
def test_image():
    import subprocess

    print("ffmpeg:", subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.split("\n")[0])
    print("aria2c:", subprocess.run(["aria2c", "--version"], capture_output=True, text=True).stdout.split("\n")[0])
    print("node:", subprocess.run(["node", "--version"], capture_output=True, text=True).stdout.strip())
    print("npm:", subprocess.run(["npm", "--version"], capture_output=True, text=True).stdout.strip())
    print("yt-dlp:", subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True).stdout.strip())
    print("cloudflared:", subprocess.run(["cloudflared", "--version"], capture_output=True, text=True).stdout.strip())
    print("mediainfo:", subprocess.run(["mediainfo", "--version"], capture_output=True, text=True).stdout.strip())
    print("gallery-dl:", subprocess.run(["gallery-dl", "--version"], capture_output=True, text=True).stdout.strip())


@app.local_entrypoint()
def main():
    test_image.remote()
