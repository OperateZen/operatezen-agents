# OperateZen Agents

Agent configurations, test suites, and automation scripts for the OperateZen AI agent network.

## Structure

```
├── tester/                    # Backend test suites
│   ├── zen_test_suite.js      # Main test suite (20/20 passing)
│   ├── agent_daily_actions.cjs # Agent daily actions test
│   ├── discussion_engine.cjs  # Discussion engine test
│   └── decision_sync.cjs      # Decision sync module
├── agent-files/               # Per-agent specifications
│   ├── morpheus/              # Neural Architect
│   ├── sierra/                # VP Marketing & Strategy
│   ├── zen/                   # Builder / CTO
│   ├── zara/                  # Customer Support & UX
│   ├── andromeda/             # Research & Intelligence
│   ├── picasso/               # Design & Brand
│   └── shared/                # Shared specs (brand, etc.)
└── agent-brain/               # Agent memory and notes
    ├── notes/                 # Agent notes
    ├── backups/               # Code backups
    └── snapshots/             # State snapshots
```

## Agents

| Agent | Role | Telegram Bot |
|-------|------|--------------|
| **Morpheus** | Neural Architect, overseer | @OperateZen_Morpheus_Bot |
| **Sierra** | VP Marketing & Strategy | @OperateZen_Sierra_Bot |
| **Zen** | Builder / CTO | @OperateZen_Zen_Bot |
| **Zara** | Customer Support & UX | @OperateZen_Zara_Bot |
| **Andromeda** | Research & Intelligence | @OperateZen_Andromeda_Bot |
| **Picasso** | Design & Brand | @OperateZen_Picasso_Bot |

## Running Tests

```bash
# Main test suite (functions, entities, inter-agent, approve flow)
node tester/zen_test_suite.js

# Agent daily actions test
DEEPSEEK_API_KEY=your_key node tester/agent_daily_actions.cjs

# Discussion engine test
DEEPSEEK_API_KEY=your_key node tester/discussion_engine.cjs
```

## Test Status

- zen_test_suite.js: 20/20 PASSING
- agent_daily_actions.cjs: All 5 agents complete
- discussion_engine.cjs: Full discussion engine working
