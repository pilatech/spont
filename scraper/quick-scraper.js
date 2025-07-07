const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

class QuickFlowerScraper {
  constructor() {
    this.products = [];
    this.baseUrl = 'https://gardeniashop.co.uk';
  }

  async scrapeCollectionsPage(page = 1) {
    try {
      const url = page === 1 
        ? `${this.baseUrl}/collections/all`
        : `${this.baseUrl}/collections/all?page=${page}`;
      
      console.log(`Scraping collections page: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        },
        timeout: 15000
      });

      const $ = cheerio.load(response.data);
      const products = [];

      // Find all product cards in the grid
      $('.product-card-wrapper').each((i, el) => {
        const $card = $(el);
        
        // Extract product information from the card structure
        const name = this.cleanText($card.find('.card__heading a').first().text());
        const productUrl = $card.find('.card__heading a').first().attr('href');
        const fullProductUrl = productUrl ? `${this.baseUrl}${productUrl}` : null;
        
        // Extract price information
        const priceElement = $card.find('.price__regular .price-item--regular').first();
        const salePriceElement = $card.find('.price__sale .price-item--sale').first();
        
        let priceText = '';
        let price = null;
        
        if (salePriceElement.length > 0) {
          priceText = this.cleanText(salePriceElement.text());
        } else if (priceElement.length > 0) {
          priceText = this.cleanText(priceElement.text());
        }
        
        price = this.extractPrice(priceText);
        
        // Extract image information
        const images = [];
        $card.find('.card__media img').each((j, imgEl) => {
          const src = $(imgEl).attr('src') || $(imgEl).attr('data-src');
          const alt = $(imgEl).attr('alt');
          if (src && !src.includes('placeholder')) {
            images.push({
              src: src.startsWith('//') ? `https:${src}` : src,
              alt: alt || ''
            });
          }
        });

        if (name && fullProductUrl) {
          products.push({
            name,
            price,
            priceText,
            images,
            url: fullProductUrl,
            scrapedAt: new Date().toISOString()
          });
        }
      });

      // Check if there are more pages
      const hasNextPage = $('.pagination__item--next').length > 0 || 
                         $('.pagination__item[aria-label*="Page"]').last().text().trim() !== '1';

      return {
        products,
        hasNextPage,
        currentPage: page
      };
    } catch (error) {
      console.error(`Error scraping collections page ${page}:`, error.message);
      return {
        products: [],
        hasNextPage: false,
        currentPage: page,
        error: error.message
      };
    }
  }

  async scrapeProductPage(url) {
    try {
      console.log(`Scraping product page: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      const name = this.cleanText($('h1.product-single__title, .product__title, h1').first().text());
      // Remove duplicate names if they appear twice
      const nameParts = name.split(' ');
      const midPoint = Math.floor(nameParts.length / 2);
      const firstHalf = nameParts.slice(0, midPoint).join(' ');
      const secondHalf = nameParts.slice(midPoint).join(' ');
      const finalName = firstHalf === secondHalf ? firstHalf : name;
      const priceText = this.cleanText($('.price__regular .price-item--regular, .price .price__regular, .price').first().text());
      const description = this.cleanText($('.product-single__description, .product__description, .rte').first().text());
      
      const images = [];
      $('.product-single__photo img, .product__media img, .product-gallery img').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        const alt = $(el).attr('alt');
        if (src && !src.includes('placeholder')) {
          images.push({
            src: src.startsWith('//') ? `https:${src}` : src,
            alt: alt || ''
          });
        }
      });

      const category = this.cleanText($('.breadcrumb__item:last-child, .product-category').first().text());
      const availability = this.cleanText($('.product-single__stock, .product__availability').first().text());
      
      const tags = [];
      $('.product-tags .tag, .product__tags .tag').each((i, el) => {
        const tagText = this.cleanText($(el).text());
        if (tagText) {
          tags.push(tagText);
        }
      });

      const price = this.extractPrice(priceText);

      return {
        name: finalName,
        price,
        priceText,
        description,
        images,
        category,
        availability,
        tags,
        url,
        scrapedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error scraping ${url}:`, error.message);
      return null;
    }
  }

  cleanText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim();
  }

  extractPrice(priceText) {
    if (!priceText) return null;
    const match = priceText.match(/[\d,]+\.?\d*/);
    return match ? parseFloat(match[0].replace(/,/g, '')) : null;
  }

  async scrapeAllProducts(maxPages = 5) {
    try {
      console.log('Starting comprehensive scraping from collections pages...');
      
      let currentPage = 1;
      let totalProducts = 0;
      
      while (currentPage <= maxPages) {
        console.log(`\n--- Scraping page ${currentPage} ---`);
        
        const pageResult = await this.scrapeCollectionsPage(currentPage);
        
        if (pageResult.error) {
          console.error(`Failed to scrape page ${currentPage}:`, pageResult.error);
          break;
        }
        
        console.log(`Found ${pageResult.products.length} products on page ${currentPage}`);
        
        // Enhance each product with detailed information
        for (let i = 0; i < pageResult.products.length; i++) {
          const product = pageResult.products[i];
          console.log(`Enhancing product ${i + 1}/${pageResult.products.length}: ${product.name}`);
          
          if (product.url) {
            const enhancedData = await this.scrapeProductPage(product.url);
            if (enhancedData && enhancedData.name) {
              this.products.push({
                ...product,
                ...enhancedData
              });
            } else {
              // Keep basic data if detailed scraping failed
              this.products.push(product);
            }
          }
          
          // Small delay to be respectful
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        totalProducts += pageResult.products.length;
        
        if (!pageResult.hasNextPage) {
          console.log('No more pages found, stopping pagination.');
          break;
        }
        
        currentPage++;
        
        // Delay between pages
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      this.saveProducts();
      console.log(`\nComprehensive scraping completed!`);
      console.log(`Total pages scraped: ${currentPage - 1}`);
      console.log(`Total products found: ${totalProducts}`);
      console.log(`Total products enhanced: ${this.products.length}`);
      
      return this.products;
      
    } catch (error) {
      console.error('Error in comprehensive scraping:', error);
      throw error;
    }
  }

  async scrapeCollectionsOnly(maxPages = 5) {
    try {
      console.log('Starting collections-only scraping...');
      
      let currentPage = 1;
      let totalProducts = 0;
      
      while (currentPage <= maxPages) {
        console.log(`\n--- Scraping page ${currentPage} ---`);
        
        const pageResult = await this.scrapeCollectionsPage(currentPage);
        
        if (pageResult.error) {
          console.error(`Failed to scrape page ${currentPage}:`, pageResult.error);
          break;
        }
        
        console.log(`Found ${pageResult.products.length} products on page ${currentPage}`);
        
        // Add products from this page
        this.products.push(...pageResult.products);
        totalProducts += pageResult.products.length;
        
        if (!pageResult.hasNextPage) {
          console.log('No more pages found, stopping pagination.');
          break;
        }
        
        currentPage++;
        
        // Delay between pages
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      this.saveProducts();
      console.log(`\nCollections-only scraping completed!`);
      console.log(`Total pages scraped: ${currentPage - 1}`);
      console.log(`Total products found: ${totalProducts}`);
      
      return this.products;
      
    } catch (error) {
      console.error('Error in collections-only scraping:', error);
      throw error;
    }
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
}

// CLI usage
if (require.main === module) {
  const scraper = new QuickFlowerScraper();
  
  const args = process.argv.slice(2);
  const mode = args[0] || 'collections'; // 'collections' or 'full'
  const maxPages = parseInt(args[1]) || 5;
  
  console.log(`Starting scraper in ${mode} mode with max ${maxPages} pages`);
  
  if (mode === 'full') {
    scraper.scrapeAllProducts(maxPages)
      .then(products => {
        console.log('Full scraping completed successfully!');
        console.log(`Total products enhanced: ${products.length}`);
      })
      .catch(error => {
        console.error('Full scraping failed:', error);
        process.exit(1);
      });
  } else {
    scraper.scrapeCollectionsOnly(maxPages)
      .then(products => {
        console.log('Collections-only scraping completed successfully!');
        console.log(`Total products found: ${products.length}`);
      })
      .catch(error => {
        console.error('Collections-only scraping failed:', error);
        process.exit(1);
      });
  }
}

module.exports = QuickFlowerScraper; 