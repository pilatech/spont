import requests
from bs4 import BeautifulSoup
import time
import json
from urllib.robotparser import RobotFileParser
import random

class GardeniaScraper:
    def __init__(self):
        self.base_url = "https://gardeniashop.co.uk"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        }
        self.products = []
        self.rp = RobotFileParser()
        self.rp.set_url(f"{self.base_url}/robots.txt")
        self.rp.read()

    def can_fetch(self, url):
        return self.rp.can_fetch("*", url)

    def get_page(self, url):
        if not self.can_fetch(url):
            print(f"Not allowed to fetch: {url}")
            return None
        
        # Add random delay between 2-5 seconds
        time.sleep(random.uniform(2, 5))
        
        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            return response.text
        except requests.RequestException as e:
            print(f"Error fetching {url}: {e}")
            return None

    def parse_product(self, product_wrapper):
        try:
            product = {}
            
            # Get product name from the card heading
            name_element = product_wrapper.find('h3', class_='card__heading')
            if name_element:
                link_element = name_element.find('a', class_='full-unstyled-link')
                if link_element:
                    product['name'] = link_element.text.strip()
                    product['url'] = self.base_url + link_element['href']
            
            # Get price
            price_element = product_wrapper.find('span', class_='price-item--regular')
            if price_element:
                product['price'] = price_element.text.strip()
            
            # Get image URL
            img_element = product_wrapper.find('img', class_='motion-reduce')
            if img_element and 'src' in img_element.attrs:
                product['image_url'] = img_element['src']
            
            return product if product.get('name') else None
        except Exception as e:
            print(f"Error parsing product: {e}")
            return None

    def scrape_collections(self):
        collections_url = f"{self.base_url}/collections"
        page_content = self.get_page(collections_url)
        
        if not page_content:
            return
        
        soup = BeautifulSoup(page_content, 'html.parser')
        collection_links = soup.find_all('a', class_='full-unstyled-link')
        
        for collection_link in collection_links:
            if 'href' in collection_link.attrs and '/collections/' in collection_link['href']:
                collection_url = self.base_url + collection_link['href']
                print(f"Scraping collection: {collection_url}")
                self.scrape_collection(collection_url)

    def scrape_collection(self, collection_url):
        page = 1
        while True:
            url = f"{collection_url}?page={page}"
            print(f"Scraping page {page} of collection")
            page_content = self.get_page(url)
            
            if not page_content:
                break
            
            soup = BeautifulSoup(page_content, 'html.parser')
            product_wrappers = soup.find_all('div', class_='card-wrapper')
            
            if not product_wrappers:
                break
            
            for product_wrapper in product_wrappers:
                product = self.parse_product(product_wrapper)
                if product:
                    self.products.append(product)
                    print(f"Found product: {product['name']}")
            
            # Check if there's a next page
            next_button = soup.find('a', class_='pagination__next')
            if not next_button:
                break
            
            page += 1

    def save_products(self, filename='products.json'):
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(self.products, f, indent=2, ensure_ascii=False)

def main():
    scraper = GardeniaScraper()
    print("Starting to scrape products...")
    scraper.scrape_collections()
    print(f"Found {len(scraper.products)} products")
    scraper.save_products()
    print("Products saved to products.json")

if __name__ == "__main__":
    main() 