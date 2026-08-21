import asyncio
import re
import urllib.request
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

async def fetch_page_content(url: str, max_chars: int = 5000) -> dict:
    """
    Renders JavaScript-heavy web pages (React, Next.js, Vue, Facebook pages)
    using headless Chromium and extracts clean, structured text.
    """
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url

    print(f"🌐 [WEB RESEARCHER] Rendering JS page: {url}")
    
    # 1. Try Playwright Headless Browser (Full JS & Single Page App execution)
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=USER_AGENT,
                viewport={"width": 1280, "height": 800}
            )
            page = await context.new_page()

            # Set navigation timeout
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            
            # Allow dynamic JS scripts and hydrations to settle
            try:
                await page.wait_for_load_state("networkidle", timeout=4000)
            except Exception:
                pass

            title = await page.title()

            # Extract text from visible elements, ignoring scripts and styles
            content = await page.evaluate("""() => {
                const unwanted = document.querySelectorAll('script, style, noscript, nav, footer, svg, header');
                unwanted.forEach(el => el.remove());
                
                // For social/Facebook pages, extract post bodies and headings
                const main = document.querySelector('main, article, [role="main"], body');
                return main ? (main.innerText || main.textContent) : document.body.innerText;
            }""")

            await browser.close()

            # Clean and sanitize whitespace
            clean_text = re.sub(r'\n{3,}', '\n\n', content).strip()
            clean_text = re.sub(r'[ \t]+', ' ', clean_text)

            if len(clean_text) > max_chars:
                clean_text = clean_text[:max_chars] + "\n...[truncated for length]"

            print(f"✅ [WEB RESEARCHER] Successfully extracted {len(clean_text)} chars from {url}")
            return {
                "success": True,
                "url": url,
                "title": title or "Web Page",
                "content": clean_text
            }

    except Exception as e:
        print(f"⚠️ [WEB RESEARCHER] Headless browser warning: {e}. Falling back to standard fetch...")
        
        # 2. Resilient Fallback to HTTP request
        try:
            req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(req, timeout=10) as response:
                html = response.read().decode('utf-8', errors='ignore')
                soup = BeautifulSoup(html, 'html.parser')
                for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'svg']):
                    tag.decompose()
                title = soup.title.string if soup.title else "Web Page"
                text = soup.get_text(separator=' ', strip=True)
                clean_text = re.sub(r'\s+', ' ', text).strip()
                if len(clean_text) > max_chars:
                    clean_text = clean_text[:max_chars] + "..."
                return {
                    "success": True,
                    "url": url,
                    "title": title,
                    "content": clean_text
                }
        except Exception as fallback_err:
            print(f"❌ [WEB RESEARCHER] Fallback error: {fallback_err}")
            return {
                "success": False,
                "url": url,
                "title": "Error Loading URL",
                "content": f"Could not extract content from {url}: {str(e)}"
            }
