
console.log("Checking Environment Variables...");
console.log("SHOPIFY_API_KEY:", process.env.SHOPIFY_API_KEY ? "Present" : "Missing");
console.log("SHOPIFY_API_SECRET:", process.env.SHOPIFY_API_SECRET ? "Present" : "Missing");
console.log("SCOPES:", process.env.SCOPES);
console.log("HOST:", process.env.HOST);
