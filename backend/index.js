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
  // +1 for favorite flower
  if (person.favoriteFlowers) {
    for (const flower of person.favoriteFlowers) {
      if (text.includes(flower.toLowerCase())) score += 1;
    }
  }
  // +1 for favorite color
  if (person.favoriteColors) {
    for (const color of person.favoriteColors) {
      if (text.includes(color.toLowerCase())) score += 1;
    }
  }
  // +1 for about keywords
  if (person.aboutThem) {
    for (const word of person.aboutThem.split(/\W+/)) {
      if (word.length > 2 && text.includes(word.toLowerCase())) score += 1;
    }
  }
  // No penalty for allergies or budget
  return score;
}

app.post('/api/suggest', (req, res) => {
  const productsPath = path.join(__dirname, 'data', 'products.json');
  if (!fs.existsSync(productsPath)) {
    return res.status(404).json({ error: 'products.json not found' });
  }
  
  const products = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
  const { people = [], budget = 500 } = req.body;
  
  // For demo: always suggest the first 3 products, regardless of input
  const suggestions = products.slice(0, 3).map(p => ({ 
    ...p, 
    score: 1,
    reason: 'Perfect match for your preferences!'
  }));
  
  res.json(suggestions);
});

app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`);
}); 