const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class EnhancedFlowerScraper {
  constructor() {
    this.products = [];
    this.errors = [];
    this.stats = {
      total: 0,
      successful: 0,
      failed: 0,
      skipped: 0
    };
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    this.page = await this.browser.newPage();
    
    // Set realistic user agent
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set viewport
    await this.page.setViewport({ width: 1920, height: 1080 });
    
    // Set extra headers
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    });
  }

  async scrapeGardeniaShop() {
    const baseUrl = 'https://gardeniashop.co.uk';
    console.log('Scraping Gardenia Shop...');
    
    try {
      // Get product listings
      await this.page.goto(`${baseUrl}/collections/all`, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
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
      
      console.log(`Found ${productUrls.length} products on Gardenia Shop`);
      
      // Scrape each product
      for (let i = 0; i < productUrls.length; i++) {
        const url = productUrls[i];
        console.log(`Progress: ${i + 1}/${productUrls.length} - ${url}`);
        
        try {
          const productData = await this.scrapeProductPage(url, 'gardenia');
          if (productData && productData.name) {
            this.products.push(productData);
            this.stats.successful++;
          } else {
            this.stats.skipped++;
          }
        } catch (error) {
          console.error(`Failed to scrape ${url}:`, error.message);
          this.errors.push({ url, error: error.message });
          this.stats.failed++;
        }
        
        // Respectful delay
        await this.page.waitForTimeout(1500 + Math.random() * 1000);
      }
      
    } catch (error) {
      console.error('Error scraping Gardenia Shop:', error);
      this.errors.push({ shop: 'gardenia', error: error.message });
    }
  }

  async scrapeProductPage(url, shop) {
    try {
      await this.page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });
      
      await this.page.waitForTimeout(2000);

      const productData = await this.page.evaluate((shopName) => {
        const getTextContent = (selectors) => {
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
              return element.textContent.trim();
            }
          }
          return null;
        };

        const getMultipleImages = (selectors) => {
          for (const selector of selectors) {
            const images = document.querySelectorAll(selector);
            if (images.length > 0) {
              return Array.from(images)
                .map(img => img.src || img.getAttribute('data-src'))
                .filter(src => src && !src.includes('placeholder'));
            }
          }
          return [];
        };

        const extractPrice = (priceText) => {
          if (!priceText) return null;
          const match = priceText.match(/[\d,]+\.?\d*/);
          return match ? parseFloat(match[0].replace(/,/g, '')) : null;
        };

        // Extract product information with multiple selector fallbacks
        const name = getTextContent([
          'h1.product-single__title',
          '.product__title',
          'h1.product-title',
          'h1',
          '.product-name'
        ]);
        
        const priceText = getTextContent([
          '.price__regular .price-item--regular',
          '.price .price__regular',
          '[data-price]',
          '.price',
          '.product-price',
          '.price__current'
        ]);
        
        const price = extractPrice(priceText);
        
        const description = getTextContent([
          '.product-single__description',
          '.product__description',
          '.rte',
          '[data-product-description]',
          '.product-details',
          '.description'
        ]);
        
        const images = getMultipleImages([
          '.product-single__photo img',
          '.product__media img',
          '.product-gallery img',
          '.product-images img',
          '.gallery img'
        ]);
        
        const category = getTextContent([
          '.breadcrumb__item:last-child',
          '.product-category',
          '[data-product-category]',
          '.category'
        ]);
        
        const availability = getTextContent([
          '.product-single__stock',
          '.product__availability',
          '[data-availability]',
          '.stock-status'
        ]);
        
        // Extract tags
        const tags = Array.from(document.querySelectorAll('.product-tags .tag, .product__tags .tag, .tags .tag'))
                         .map(tag => tag.textContent.trim())
                         .filter(tag => tag.length > 0);
        
        // Extract variants
        const variants = Array.from(document.querySelectorAll('.product-form__input select option, .variant-selector option'))
                             .map(option => ({
                               name: option.textContent.trim(),
                               value: option.value
                             }))
                             .filter(variant => variant.name && variant.name !== 'Select');

        return {
          name,
          price,
          priceText,
          description,
          images,
          category,
          availability,
          tags,
          variants: variants.length > 0 ? variants : null,
          shop: shopName,
          url,
          scrapedAt: new Date().toISOString()
        };
      }, shop);

      return productData;
    } catch (error) {
      console.error(`Error scraping ${url}:`, error.message);
      return null;
    }
  }

  async scrapeAllShops() {
    try {
      await this.init();
      
      // Scrape Gardenia Shop
      await this.scrapeGardeniaShop();
      
      // Add more shops here as needed
      // await this.scrapeOtherShop();
      
      await this.browser.close();
      
      // Process and save data
      this.processData();
      this.saveProducts();
      this.saveStats();
      
      console.log('Scraping completed!');
      console.log('Stats:', this.stats);
      console.log(`Errors: ${this.errors.length}`);
      
      return this.products;
      
    } catch (error) {
      console.error('Error in scrapeAllShops:', error);
      if (this.browser) {
        await this.browser.close();
      }
      throw error;
    }
  }

  processData() {
    console.log('Processing scraped data...');
    
    this.products = this.products.map(product => {
      // Clean and enrich data
      const enriched = {
        ...product,
        name: this.cleanText(product.name),
        description: this.cleanText(product.description),
        category: this.cleanText(product.category),
        availability: this.cleanText(product.availability),
        tags: product.tags ? product.tags.map(tag => this.cleanText(tag)) : [],
        // Add derived fields
        hasImage: product.images && product.images.length > 0,
        imageCount: product.images ? product.images.length : 0,
        hasPrice: product.price !== null && product.price > 0,
        hasDescription: product.description && product.description.length > 10,
        wordCount: product.description ? product.description.split(' ').length : 0
      };
      
      return enriched;
    }).filter(product => {
      // Filter out products with missing essential data
      return product.name && product.name.length > 0;
    });
    
    console.log(`Processed ${this.products.length} products`);
  }

  cleanText(text) {
    if (!text) return null;
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim();
  }

  saveProducts() {
    const outputPath = path.join(__dirname, '..', 'backend', 'data', 'products.json');
    const outputDir = path.dirname(outputPath);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(this.products, null, 2));
    console.log(`Products saved to: ${outputPath}`);
  }

  saveStats() {
    const statsPath = path.join(__dirname, '..', 'backend', 'data', 'scraping-stats.json');
    const statsData = {
      stats: this.stats,
      errors: this.errors,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(statsPath, JSON.stringify(statsData, null, 2));
    console.log(`Stats saved to: ${statsPath}`);
  }
}

// CLI usage
if (require.main === module) {
  const scraper = new EnhancedFlowerScraper();
  
  scraper.scrapeAllShops()
    .then(products => {
      console.log('Enhanced scraping completed successfully!');
      console.log(`Total products scraped: ${products.length}`);
    })
    .catch(error => {
      console.error('Enhanced scraping failed:', error);
      process.exit(1);
    });
}

module.exports = EnhancedFlowerScraper; 