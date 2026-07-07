import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);

  const agentsData = [
    {
      id: 1,
      name: "Product Research",
      role: "Product Research Specialist",
      goal: "Find trending products with high profit potential",
      status: "✅ Running",
      lastTask: "البحث عن منتجات رائجة",
      results: "5 منتجات جديدة وجدتها"
    },
    {
      id: 2,
      name: "Shopify Manager",
      role: "Shopify Store Manager",
      goal: "Manage and optimize Shopify store products automatically",
      status: "✅ Running",
      lastTask: "إضافة منتجات جديدة",
      results: "3 منتجات أُضيفت"
    },
    {
      id: 3,
      name: "Marketing & Ads",
      role: "Marketing & Ads Specialist",
      goal: "Create and manage profitable advertising campaigns",
      status: "✅ Running",
      lastTask: "إنشاء حملة إعلانية",
      results: "تم إنشاء 2 حملة"
    },
    {
      id: 4,
      name: "Customer Service",
      role: "Customer Service Manager",
      goal: "Provide excellent customer support",
      status: "✅ Running",
      lastTask: "الرد على 15 استفسار",
      results: "تم حل 14 مشكلة"
    },
    {
      id: 5,
      name: "Order Management",
      role: "Order Manager",
      goal: "Manage orders from receipt to delivery",
      status: "✅ Running",
      lastTask: "معالجة 20 طلب",
      results: "10 طلبات مُشحونة"
    },
    {
      id: 6,
      name: "Competitor Analysis",
      role: "Competitor Analyst",
      goal: "Monitor competitor activities",
      status: "✅ Running",
      lastTask: "تحليل 5 منافسين",
      results: "تقرير بـ 15 تغيير"
    },
    {
      id: 7,
      name: "Inventory Management",
      role: "Inventory Manager",
      goal: "Maintain optimal inventory levels",
      status: "✅ Running",
      lastTask: "مراجعة المخزون",
      results: "3 منتجات للطلب"
    },
    {
      id: 8,
      name: "Platform Sync",
      role: "Platform Synchronization Manager",
      goal: "Keep all platforms synchronized",
      status: "✅ Running",
      lastTask: "مزامنة 150 منتج",
      results: "100% متزامن"
    },
    {
      id: 9,
      name: "Analytics",
      role: "Analytics Specialist",
      goal: "Provide insights on business performance",
      status: "✅ Running",
      lastTask: "إنشاء تقرير يومي",
      results: "ROI: 245%"
    },
    {
      id: 10,
      name: "Content Creator",
      role: "Content Creator",
      goal: "Create compelling product descriptions",
      status: "✅ Running",
      lastTask: "كتابة 25 وصف",
      results: "معدل تحويل: 3.5%"
    },
    {
      id: 11,
      name: "Supplier Manager",
      role: "Supplier Relationship Manager",
      goal: "Manage supplier relationships",
      status: "✅ Running",
      lastTask: "التفاوض مع 3 موردين",
      results: "توفير: 12%"
    }
  ];

  useEffect(() => {
    setAgents(agentsData);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>🤖 AI Agents Dashboard</h1>
        <p>مراقبة وإدارة 11 وكيل ذكي</p>
      </header>

      <div className="container">
        <div className="agents-grid">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="agent-card"
              onClick={() => setSelectedAgent(agent)}
              style={{
                cursor: 'pointer',
                border: selectedAgent?.id === agent.id ? '2px solid #00d4ff' : '1px solid #ddd'
              }}
            >
              <div className="agent-header">
                <h3>{agent.name}</h3>
                <span className="status">{agent.status}</span>
              </div>
              <p className="role">{agent.role}</p>
              <p className="goal">🎯 {agent.goal}</p>
            </div>
          ))}
        </div>

        {selectedAgent && (
          <div className="agent-details">
            <div className="details-header">
              <h2>{selectedAgent.name}</h2>
              <button onClick={() => setSelectedAgent(null)} className="close-btn">✕</button>
            </div>
            
            <div className="details-content">
              <div className="detail-item">
                <strong>Role:</strong>
                <p>{selectedAgent.role}</p>
              </div>

              <div className="detail-item">
                <strong>Goal:</strong>
                <p>{selectedAgent.goal}</p>
              </div>

              <div className="detail-item">
                <strong>Status:</strong>
                <p>{selectedAgent.status}</p>
              </div>

              <div className="detail-item">
                <strong>Last Task:</strong>
                <p>{selectedAgent.lastTask}</p>
              </div>

              <div className="detail-item">
                <strong>Results:</strong>
                <p className="results">{selectedAgent.results}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;