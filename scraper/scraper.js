const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class FlowerShopScraper {
  constructor() {
    this.baseUrl = 'https://gardeniashop.co.uk';
    this.products = [];
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: false, // Set to true for production
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    
    // Set user agent to avoid detection
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set viewport
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async scrapeProductPage(url) {
    try {
      console.log(`Scraping: ${url}`);
      await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for content to load
      await this.page.waitForTimeout(2000);

      const productData = await this.page.evaluate(() => {
        const getTextContent = (selector) => {
          const element = document.querySelector(selector);
          return element ? element.textContent.trim() : null;
        };

        const getAttribute = (selector, attribute) => {
          const element = document.querySelector(selector);
          return element ? element.getAttribute(attribute) : null;
        };

        const getMultipleImages = (selector) => {
          const images = document.querySelectorAll(selector);
          return Array.from(images).map(img => img.src).filter(src => src);
        };

        // Extract product information
        const name = getTextContent('h1.product-single__title') || 
                    getTextContent('.product__title') ||
                    getTextContent('h1');
        
        const price = getTextContent('.price__regular .price-item--regular') ||
                     getTextContent('.price .price__regular') ||
                     getTextContent('[data-price]') ||
                     getTextContent('.price');
        
        const description = getTextContent('.product-single__description') ||
                          getTextContent('.product__description') ||
                          getTextContent('.rte') ||
                          getTextContent('[data-product-description]');
        
        const images = getMultipleImages('.product-single__photo img, .product__media img, .product-gallery img');
        
        const category = getTextContent('.breadcrumb__item:last-child') ||
                        getTextContent('.product-category') ||
                        getTextContent('[data-product-category]');
        
        const availability = getTextContent('.product-single__stock') ||
                           getTextContent('.product__availability') ||
                           getTextContent('[data-availability]');
        
        const tags = Array.from(document.querySelectorAll('.product-tags .tag, .product__tags .tag'))
                         .map(tag => tag.textContent.trim());
        
        const variants = Array.from(document.querySelectorAll('.product-form__input select option, .variant-selector option'))
                             .map(option => ({
                               name: option.textContent.trim(),
                               value: option.value
                             }));

        return {
          name,
          price,
          description,
          images,
          category,
          availability,
          tags,
          variants: variants.length > 0 ? variants : null,
          scrapedAt: new Date().toISOString()
        };
      });

      return productData;
    } catch (error) {
      console.error(`Error scraping ${url}:`, error.message);
      return null;
    }
  }

  async scrapeProductListings() {
    try {
      console.log('Scraping product listings...');
      await this.page.goto(`${this.baseUrl}/collections/all`, { waitUntil: 'networkidle2' });
      
      // Wait for products to load
      await this.page.waitForTimeout(3000);

      const productUrls = await this.page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/products/"]');
        const urls = new Set();
        
        links.forEach(link => {
          const href = link.href;
          if (href.includes('/products/') && !href.includes('#') && !href.includes('?')) {
            urls.add(href);
          }
        });
        
        return Array.from(urls);
      });

      console.log(`Found ${productUrls.length} product URLs`);
      return productUrls;
    } catch (error) {
      console.error('Error scraping product listings:', error.message);
      return [];
    }
  }

  async scrapeAllProducts() {
    try {
      await this.init();
      
      // Get all product URLs
      const productUrls = await this.scrapeProductListings();
      
      console.log(`Starting to scrape ${productUrls.length} products...`);
      
      // Scrape each product
      for (let i = 0; i < productUrls.length; i++) {
        const url = productUrls[i];
        console.log(`Progress: ${i + 1}/${productUrls.length}`);
        
        const productData = await this.scrapeProductPage(url);
        
        if (productData && productData.name) {
          this.products.push({
            ...productData,
            url
          });
        }
        
        // Be respectful - add delay between requests
        await this.page.waitForTimeout(1000);
      }
      
      await this.browser.close();
      
      // Save to file
      this.saveProducts();
      
      console.log(`Successfully scraped ${this.products.length} products`);
      return this.products;
      
    } catch (error) {
      console.error('Error in scrapeAllProducts:', error);
      if (this.browser) {
        await this.browser.close();
      }
      throw error;
    }
  }

  saveProducts() {
    const outputPath = path.join(__dirname, '..', 'backend', 'data', 'products.json');
    const outputDir = path.dirname(outputPath);
    
    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(this.products, null, 2));
    console.log(`Products saved to: ${outputPath}`);
  }

  async scrapeWithRetry(url, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.scrapeProductPage(url);
      } catch (error) {
        console.error(`Attempt ${attempt} failed for ${url}:`, error.message);
        if (attempt === maxRetries) {
          throw error;
        }
        await this.page.waitForTimeout(2000 * attempt); // Exponential backoff
      }
    }
  }
}

// CLI usage
if (require.main === module) {
  const scraper = new FlowerShopScraper();
  
  scraper.scrapeAllProducts()
    .then(products => {
      console.log('Scraping completed successfully!');
      console.log(`Total products scraped: ${products.length}`);
    })
    .catch(error => {
      console.error('Scraping failed:', error);
      process.exit(1);
    });
}

module.exports = FlowerShopScraper; 