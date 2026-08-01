import os
import urllib.request

cert_dir = os.path.join(os.path.dirname(__file__), "..", "certs")
os.makedirs(cert_dir, exist_ok=True)
cert_path = os.path.join(cert_dir, "isrgrootx1.pem")

url = "https://letsencrypt.org/certs/isrgrootx1.pem"
print(f"Downloading certificate from {url}...")
urllib.request.urlretrieve(url, cert_path)
print(f"Saved certificate to {cert_path}")
