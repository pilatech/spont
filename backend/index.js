const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// GET /api/products
app.get('/api/products', (req, res) => {
  const productsPath = path.join(__dirname, 'data', 'products.json');
  if (fs.existsSync(productsPath)) {
    const products = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
    res.json(products);
  } else {
    res.status(404).json({ error: 'products.json not found' });
  }
});

// POST /api/suggest
function scoreProduct(product, person, budget) {
  let score = 0;
  const name = (product.name || '').toLowerCase();
  const desc = (product.description || '').toLowerCase();
  const text = name + ' ' + desc;
  
  // Budget scoring (higher score for products within budget)
  if (product.price && budget) {
    const priceRatio = product.price / budget;
    if (priceRatio <= 0.8) score += 3; // Great value
    else if (priceRatio <= 1.0) score += 2; // Within budget
    else if (priceRatio <= 1.2) score += 1; // Slightly over
    else score -= 2; // Too expensive
  }
  
  // Flower type matching
  if (person.favoriteFlowers) {
    for (const flower of person.favoriteFlowers) {
      const flowerLower = flower.toLowerCase();
      if (text.includes(flowerLower)) {
        score += 2; // Strong match for favorite flowers
      }
    }
  }
  
  // Color matching
  if (person.favoriteColors) {
    for (const color of person.favoriteColors) {
      const colorLower = color.toLowerCase();
      if (text.includes(colorLower)) {
        score += 1; // Color preference match
      }
    }
  }
  
  // About them keywords
  if (person.aboutThem) {
    const words = person.aboutThem.toLowerCase().split(/\W+/);
    for (const word of words) {
      if (word.length > 3 && text.includes(word)) {
        score += 1; // Keyword match
      }
    }
  }
  
  // Allergy avoidance
  if (person.allergies) {
    for (const allergy of person.allergies) {
      const allergyLower = allergy.toLowerCase();
      if (text.includes(allergyLower)) {
        score -= 5; // Heavy penalty for allergies
      }
    }
  }
  
  // Bonus for products with images
  if (product.images && product.images.length > 0) {
    score += 1;
  }
  
  // Bonus for products with descriptions
  if (product.description && product.description.length > 20) {
    score += 1;
  }
  
  return score;
}

app.post('/api/suggest', (req, res) => {
  const productsPath = path.join(__dirname, 'data', 'products.json');
  if (!fs.existsSync(productsPath)) {
    return res.status(404).json({ error: 'products.json not found' });
  }
  
  const products = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
  const { people = [], budget = 500 } = req.body;
  
  // Filter out products without essential data
  const validProducts = products.filter(p => p.name && p.name.trim().length > 0);
  
  if (validProducts.length === 0) {
    return res.status(404).json({ error: 'No valid products found' });
  }
  
  // Score products for each person
  const scoredProducts = validProducts.map(product => {
    let totalScore = 0;
    let reasons = [];
    
    // Score for each person
    people.forEach(person => {
      const personScore = scoreProduct(product, person, budget);
      totalScore += personScore;
      
      // Generate reasons
      if (person.favoriteFlowers) {
        person.favoriteFlowers.forEach(flower => {
          if ((product.name + ' ' + (product.description || '')).toLowerCase().includes(flower.toLowerCase())) {
            reasons.push(`Contains ${person.name || 'their'} favorite flower: ${flower}`);
          }
        });
      }
      
      if (product.price && budget && product.price <= budget) {
        reasons.push(`Within budget (£${product.price})`);
      }
    });
    
    return {
      ...product,
      score: totalScore,
      reasons: reasons.length > 0 ? reasons : ['Great seasonal choice!']
    };
  });
  
  // Sort by score (highest first) and take top 20 for randomization pool
  const topProducts = scoredProducts
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  
  // Randomize selection from top products for demo purposes
  const shuffled = [...topProducts].sort(() => Math.random() - 0.5);
  const suggestions = shuffled
    .slice(0, 6)
    .map(product => ({
      ...product,
      score: Math.max(1, product.score) // Ensure minimum score of 1
    }));
  
  res.json(suggestions);
});

app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`);
}); 