window.SEJUK_DEMO = {
  business: "Seri Pagi Bakery & Café",

  assets: [
    {
      name: "Freezer 1",
      type: "Freezer",
      temperature: "−18°C",
      range: "−35° to −15°C",
      status: "NORMAL",
      fill: 58
    },
    {
      name: "Freezer 2",
      type: "Freezer",
      temperature: "−11°C",
      range: "−35° to −15°C",
      status: "CRITICAL",
      fill: 78
    },
    {
      name: "Display Chiller",
      type: "Chiller",
      temperature: "3.2°C",
      range: "0° to 5°C",
      status: "NORMAL",
      fill: 44
    },
    {
      name: "Kitchen Chiller",
      type: "Chiller",
      temperature: "4.1°C",
      range: "0° to 5°C",
      status: "NORMAL",
      fill: 61
    }
  ],

  incident: {
    id: "inc_7f3a",
    asset: "Freezer 2",
    temperature: "−11°C",
    safeRange: "−35° to −15°C",
    stockAtRisk: 1850,
    backup: "Freezer 1",
    backupSpace: "180 L free",
    vendor: "CoolTech Refrigeration",
    callout: 180,
    approvalLimit: 150,

    items: [
      { name: "Butter blocks", value: 640 },
      { name: "Puff pastry sheets", value: 450 },
      { name: "Chicken fillet", value: 350 },
      { name: "Ice-cream tubs", value: 410 }
    ],

    timeline: [
      {
        time: "9:30 PM",
        title: "Critical temperature detected",
        detail: "Freezer 2 reading: −11°C"
      },
      {
        time: "9:31 PM",
        title: "Stock risk calculated",
        detail: "Estimated stock at risk: RM 1,850.00"
      },
      {
        time: "9:31 PM",
        title: "Approval requested",
        detail: "CoolTech call-out: RM 180.00 · Owner approval required"
      }
    ]
  }
};