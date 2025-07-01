# Instructions for Cursor AI: Spontaneous Gifting App Development

## Overall Goal
Develop a **Spontaneous Gifting App** that leverages AI to suggest flower gifts for friends and relatives, manages user accounts and contacts, tracks user budget, and automates the checkout process on a Shopify-based florist website.

---

## Detailed Steps

### 1. User Authentication
- Implement **robust user signup** functionality.
- Implement **secure user login** functionality.
- Consider using authentication frameworks or services like Passport.js, Firebase Authentication, or Auth0 for security and ease of implementation.
- Ensure encrypted communication (HTTPS) and include password recovery mechanisms[1][3][5].

### 2. Friends and Relatives Management
- Create a module that allows users to **Create, Read, Update, and Delete (CRUD)** their friends' and relatives' details.
- Store information such as names, relationships, and special dates (optional).

### 3. Budget Management
- Develop a feature to enable users to **set and manage a maximum overall budget** for gifts.

### 4. Onboarding Process (Optional Integration)
- Integrate the Friends and Relatives Management and Budget Management functionalities into an **optional onboarding flow**.
- Allow users to skip these steps during initial setup and complete them later.

### 5. Florist Product Acquisition (Scraping)
- Develop a **web scraping mechanism** to extract product information (flower types, prices, descriptions, images, availability) from the Shopify-based florist website.
- This is the **sole method** for obtaining product details and is critical to the app.

### 6. AI-Powered Flower Suggestion and User Interaction
- Implement an **AI-driven system** to generate flower suggestions tailored to specific friends or relatives.
- Deliver suggestions via **push notifications**.
- Provide interaction options within the notification or app UI:
  - **Acceptance:** Automatically initiate checkout.
  - **Rejection:** Stop suggestions for that relative until reactivated.
  - **Request for Other Suggestions:** Generate and deliver alternative suggestions immediately.

### 7. Automated Checkout
- Upon user acceptance, implement a **fully automated checkout process** on the Shopify florist website.
- Programmatically add the selected flower to the cart, fill shipping and payment details, and complete the order without further user intervention.

### 8. Deployment
- Deploy the app to **Expo** to allow users to test it on their devices.

---

## Key Considerations

| Aspect                 | Details                                                                                          |
|------------------------|------------------------------------------------------------------------------------------------|
| **AI for Suggestions** | Use recipient details and scraped product data to generate relevant flower recommendations.     |
| **Data Source**        | All product data must be obtained exclusively via scraping the Shopify florist website.         |
| **Push Notifications** | System must support sending push notifications to users for suggestion delivery and interaction.|
| **Seamless Automation**| Checkout process must be robust and fully automated to handle typical Shopify e-commerce flows. |
| **User Experience**    | Ensure smooth, intuitive flows especially around suggestion acceptance, rejection, and alternatives.|

---

**Current date:** Sunday, June 29, 2025, 5:23 PM CAT
