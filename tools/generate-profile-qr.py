"""Regenerate the static profile-management QR with installed ReportLab."""
import html
import json
from pathlib import Path
from reportlab.graphics.barcode.qrencoder import QRCode, QRErrorCorrectLevel

root = Path(__file__).resolve().parent.parent
url = json.loads((root / 'app/strings.json').read_text(encoding='utf-8'))['profiles.url']
qr = QRCode(None, QRErrorCorrectLevel.M)
qr.addData(url)
qr.make()
size = qr.getModuleCount()
cells = ' '.join(f'M{x+4} {y+4}h1v1h-1z' for y, row in enumerate(qr.modules) for x, dark in enumerate(row) if dark)
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size+8} {size+8}" data-url="{html.escape(url, quote=True)}"><rect width="100%" height="100%" fill="white"/><path d="{cells}" fill="black"/></svg>\n'
(root / 'app/assets/profile-qr.svg').write_text(svg, encoding='utf-8')
