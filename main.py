#!/usr/bin/env python3
"""
Platform-agnostic app starter.
Installs dependencies and starts the Node.js server.
"""

import subprocess
import os

def main():
    base_dir = os.path.dirname(__file__)
    server_dir = os.path.join(base_dir, "server")
    client_dir = os.path.join(base_dir, "client")
    
    # Install server dependencies if needed
    if not os.path.exists(os.path.join(server_dir, "node_modules")):
        print("Installing server dependencies...")
        subprocess.run(["npm", "install"], cwd=server_dir, check=True)
    
    # Install and build client if needed
    if not os.path.exists(os.path.join(client_dir, "dist")):
        if not os.path.exists(os.path.join(client_dir, "node_modules")):
            print("Installing client dependencies...")
            subprocess.run(["npm", "install"], cwd=client_dir, check=True)
        print("Building client...")
        subprocess.run(["npm", "run", "build"], cwd=client_dir, check=True)
    
    # Start the server
    print("Starting server on http://localhost:3000")
    subprocess.run(["npm", "run", "start"], cwd=server_dir)

if __name__ == "__main__":
    main()
