from crewai import Agent, Task, Crew
from anthropic import Anthropic

# Initialize Anthropic client
client = Anthropic()

# Product Research Agent
product_research_agent = Agent(
    role="Product Research Specialist",
    goal="Find trending products with high profit potential",
    backstory="""You are an expert at analyzing market trends,
    identifying bestselling products, and calculating profit margins.
    You monitor TikTok, Instagram, Pinterest, and Amazon for emerging trends."""
)

# Shopify Manager Agent
shopify_agent = Agent(
    role="Shopify Store Manager",
    goal="Manage and optimize Shopify store products automatically",
    backstory="""You are experienced in managing Shopify stores,
    uploading products, optimizing pricing, and improving store performance."""
)

# Marketing & Ads Agent
marketing_agent = Agent(
    role="Marketing & Ads Specialist",
    goal="Create and manage profitable advertising campaigns",
    backstory="""You are skilled in Facebook Ads, TikTok Ads, and Google Ads.
    You create compelling copy and manage marketing budgets efficiently."""
)

# Customer Service Agent
customer_service_agent = Agent(
    role="Customer Service Manager",
    goal="Provide excellent customer support and resolve issues",
    backstory="""You are empathetic and efficient at handling customer inquiries,
    processing refunds, and maintaining customer satisfaction."""
)

# Order Management Agent
order_agent = Agent(
    role="Order Manager",
    goal="Manage orders from receipt to delivery",
    backstory="""You track orders, coordinate with suppliers,
    and ensure timely delivery to customers."""
)

# Competitor Analysis Agent
competitor_agent = Agent(
    role="Competitor Analyst",
    goal="Monitor competitor activities and market trends",
    backstory="""You analyze competitor prices, products, and strategies
    to help optimize our approach."""
)

# Inventory Management Agent
inventory_agent = Agent(
    role="Inventory Manager",
    goal="Maintain optimal inventory levels",
    backstory="""You monitor stock levels, predict demand,
    and coordinate reorders with suppliers."""
)

# Multi-Platform Sync Agent
sync_agent = Agent(
    role="Platform Synchronization Manager",
    goal="Keep all platforms synchronized",
    backstory="""You manage product listings across Shopify, Amazon, 
    WooCommerce, Etsy, and Salla platforms."""
)

# Analytics Agent
analytics_agent = Agent(
    role="Analytics Specialist",
    goal="Provide insights and reports on business performance",
    backstory="""You analyze sales data, calculate ROI, and provide
    actionable insights for business growth."""
)

# Content Creator Agent
content_agent = Agent(
    role="Content Creator",
    goal="Create compelling product descriptions and marketing content",
    backstory="""You write engaging product descriptions,
    social media posts, and ad copy."""
)

# Supplier Agent
supplier_agent = Agent(
    role="Supplier Relationship Manager",
    goal="Manage relationships with suppliers and vendors",
    backstory="""You negotiate prices, track shipments,
    and maintain supplier relationships."""
)

# Create a crew with all agents
crew = Crew(
    agents=[
        product_research_agent,
        shopify_agent,
        marketing_agent,
        customer_service_agent,
        order_agent,
        competitor_agent,
        inventory_agent,
        sync_agent,
        analytics_agent,
        content_agent,
        supplier_agent
    ]
)

if __name__ == "__main__":
    print("✅ 11 AI Agents initialized successfully!")
    print("Agents ready:")
    for i, agent in enumerate(crew.agents, 1):
        print(f"{i}. {agent.role}")