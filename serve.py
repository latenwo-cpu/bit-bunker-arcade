# Run:  python3 serve.py   then open http://localhost:8080
import http.server, socketserver, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "pixel-arcade-website"))
with socketserver.TCPServer(("", 8080), http.server.SimpleHTTPRequestHandler) as s:
    print("Pixel Arcade running at http://localhost:8080"); s.serve_forever()
