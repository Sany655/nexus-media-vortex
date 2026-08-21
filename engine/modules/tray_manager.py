import threading
import webbrowser
import os
import sys
from PIL import Image, ImageDraw, ImageFont
import pystray
from pystray import MenuItem as item

# Force UTF-8 on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

def create_tray_icon_image(status="online"):
    """
    Generates a high-contrast, clean 64x64 system tray badge icon.
    """
    size = (64, 64)
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # 1. Dark Rounded Background
    draw.rounded_rectangle([(2, 2), (62, 62)], radius=14, fill=(18, 18, 24, 255), outline=(40, 40, 55, 255), width=2)

    # 2. Main "N" Vortex Glyph (Emerald Gradient Style)
    draw.line([(18, 46), (18, 18)], fill=(16, 185, 129, 255), width=4)
    draw.line([(18, 18), (46, 46)], fill=(52, 211, 153, 255), width=4)
    draw.line([(46, 46), (46, 18)], fill=(16, 185, 129, 255), width=4)

    # 3. Live Green Status Dot (Top-Right Badge)
    dot_color = (16, 185, 129, 255) if status == "online" else (239, 68, 68, 255)
    draw.ellipse([(44, 4), (58, 18)], fill=dot_color, outline=(18, 18, 24, 255), width=2)

    return image

class SystemTrayManager:
    def __init__(self, on_exit_callback=None, on_sync_callback=None):
        self.on_exit = on_exit_callback
        self.on_sync = on_sync_callback
        self.icon = None
        self._thread = None

    def _open_dashboard(self, icon, item):
        webbrowser.open("http://localhost:3000")

    def _trigger_sync(self, icon, item):
        if self.on_sync:
            self.on_sync()
        if self.icon:
            self.icon.notify("Schedules and Analytics synchronized with cloud.", "Nexus Media Vortex")

    def _exit_app(self, icon, item):
        print("\n👋 System Tray requested application shutdown.")
        if self.icon:
            self.icon.stop()
        if self.on_exit:
            self.on_exit()
        os._exit(0)

    def start(self):
        """Starts the tray icon in a dedicated background thread."""
        def _run():
            image = create_tray_icon_image("online")
            menu = pystray.Menu(
                item("🟢 Nexus Engine: LIVE", lambda: None, enabled=False),
                item("📡 Port: 5001 (Socket.IO)", lambda: None, enabled=False),
                pystray.Menu.SEPARATOR,
                item("🌐 Open Dashboard", self._open_dashboard, default=True),
                item("🔄 Sync Analytics & Schedules", self._trigger_sync),
                pystray.Menu.SEPARATOR,
                item("🛑 Stop Engine & Exit", self._exit_app)
            )

            self.icon = pystray.Icon(
                "NexusMediaVortex",
                image,
                "Nexus Media Vortex — Engine Live",
                menu
            )
            print("🟢 [SYSTEM TRAY] System tray badge active in OS taskbar.")
            self.icon.run()

        self._thread = threading.Thread(target=_run, daemon=True)
        self._thread.start()

    def update_status(self, status="online", tooltip_text=None):
        if self.icon:
            self.icon.icon = create_tray_icon_image(status)
            if tooltip_text:
                self.icon.title = tooltip_text
