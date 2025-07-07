const axios = require('axios');

async function testSuggestions() {
  try {
    console.log('Testing improved suggestion system...\n');
    
    // Test case 1: Person who loves roses with a budget
    const testData1 = {
      people: [{
        name: "Sarah",
        favoriteFlowers: ["roses", "peonies"],
        favoriteColors: ["red", "pink"],
        aboutThem: "romantic person who loves elegant flowers",
        allergies: []
      }],
      budget: 100
    };
    
    console.log('Test 1: Sarah loves roses and peonies, budget £100');
    const response1 = await axios.post('http://localhost:4000/api/suggest', testData1);
    console.log(`Found ${response1.data.length} suggestions:`);
    response1.data.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} - £${product.price} (Score: ${product.score})`);
      console.log(`   Reasons: ${product.reasons.join(', ')}`);
    });
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test case 2: Person with allergies
    const testData2 = {
      people: [{
        name: "John",
        favoriteFlowers: ["lilies"],
        favoriteColors: ["white"],
        aboutThem: "minimalist who prefers simple arrangements",
        allergies: ["lilies"]
      }],
      budget: 50
    };
    
    console.log('Test 2: John loves lilies but is allergic, budget £50');
    const response2 = await axios.post('http://localhost:4000/api/suggest', testData2);
    console.log(`Found ${response2.data.length} suggestions:`);
    response2.data.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} - £${product.price} (Score: ${product.score})`);
      console.log(`   Reasons: ${product.reasons.join(', ')}`);
    });
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test case 3: Multiple people
    const testData3 = {
      people: [
        {
          name: "Emma",
          favoriteFlowers: ["sunflowers"],
          favoriteColors: ["yellow"],
          aboutThem: "cheerful person who loves bright colors",
          allergies: []
        },
        {
          name: "Mike",
          favoriteFlowers: ["eucalyptus"],
          favoriteColors: ["green"],
          aboutThem: "nature lover who prefers greenery",
          allergies: []
        }
      ],
      budget: 80
    };
    
    console.log('Test 3: Emma and Mike with different preferences, budget £80');
    const response3 = await axios.post('http://localhost:4000/api/suggest', testData3);
    console.log(`Found ${response3.data.length} suggestions:`);
    response3.data.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} - £${product.price} (Score: ${product.score})`);
      console.log(`   Reasons: ${product.reasons.join(', ')}`);
    });
    
  } catch (error) {
    console.error('Error testing suggestions:', error.message);
  }
}

testSuggestions(); 