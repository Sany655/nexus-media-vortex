from playwright.sync_api import sync_playwright
import time

def scrape():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        print("Navigating to Gemini link...")
        page.goto('https://gemini.google.com/share/34d8e461595f', wait_until='networkidle')
        
        # Wait a bit for the chat to render
        time.sleep(3)
        
        # Extract all text from the main conversation area
        text = page.locator('body').inner_text()
        
        print("\n--- EXTRACTED TEXT ---")
        # Print the first 5000 characters just to be safe
        print(text[:5000])
        print("--- END ---")
        
        browser.close()

if __name__ == "__main__":
    scrape()
