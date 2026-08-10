import asyncio
import os
import argparse
import sys
from playwright.async_api import async_playwright

def format_netscape(cookies):
    """Converts Playwright cookies to Netscape HTTP Cookie File format."""
    lines = ["# Netscape HTTP Cookie File", "# https://curl.haxx.se/rfc/cookie_spec.html", "# This is a generated file!  Do not edit.", ""]
    for cookie in cookies:
        domain = cookie.get('domain', '')
        # Format domain correctly for netscape format
        if not domain.startswith('.') and not cookie.get('hostOnly', False):
            domain = '.' + domain
            
        flag = "TRUE" if domain.startswith('.') else "FALSE"
        path = cookie.get('path', '/')
        secure = "TRUE" if cookie.get('secure', False) else "FALSE"
        expiration = str(int(cookie.get('expires', 0))) if cookie.get('expires', -1) > 0 else "0"
        name = cookie.get('name', '')
        value = cookie.get('value', '')
        
        lines.append(f"{domain}\t{flag}\t{path}\t{secure}\t{expiration}\t{name}\t{value}")
    
    return "\n".join(lines)

async def main():
    parser = argparse.ArgumentParser(description="TikTok Login Helper")
    parser.add_argument("--channel", default="neuron_buster", help="Channel ID to save cookies for")
    args = parser.parse_args()
    
    print(f"\n=======================================================")
    print(f"🔐 NEXUS TIKTOK LOGIN HELPER for '{args.channel}'")
    print(f"=======================================================")
    print("1. A browser window will open automatically.")
    print("2. Please log into TikTok manually.")
    print("3. Solve the puzzle captcha if prompted.")
    print("4. The script will wait until it detects a successful login.")
    print("5. It will automatically save the cookies and close the window.")
    print("=======================================================\n")
    
    async with async_playwright() as p:
        # We MUST use non-headless so the user can interact
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        await page.goto("https://www.tiktok.com/login")
        
        print("⏳ Waiting for you to log in...")
        
        logged_in = False
        while not logged_in:
            await asyncio.sleep(2)
            cookies = await context.cookies()
            # Check for the 'sessionid' cookie, which indicates a successful login
            for cookie in cookies:
                if cookie['name'] == 'sessionid':
                    logged_in = True
                    break
                    
        print("✅ Successful login detected! Extracting cookies...")
        
        final_cookies = await context.cookies()
        netscape_formatted = format_netscape(final_cookies)
        
        # Ensure the channel directory exists
        channel_dir = os.path.join(os.getcwd(), "channels", args.channel)
        os.makedirs(channel_dir, exist_ok=True)
        
        cookie_path = os.path.join(channel_dir, "tiktok_cookies.txt")
        with open(cookie_path, "w", encoding="utf-8") as f:
            f.write(netscape_formatted)
            
        print(f"🎉 SUCCESS! Cookies saved to: {cookie_path}")
        await browser.close()
        sys.exit(0)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n❌ Login cancelled by user.")
        sys.exit(1)
