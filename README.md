To access the tool: https://thinkprintweb.onrender.com/ 

No Setup required, just go to the webstie and start designing your own designs

Pipeline

Natural Language → Grok LLM → OpenSCAD Code → STL → 3MF (with colors) → Polyslice G-Code → Download

Features

Natural language to CAD code — Describe your design, Grok generates parametric OpenSCAD

Real-time 3D preview — Rotate, zoom, pan in browser (Three.js)

Multi-color rendering — 3MF with full color metadata support

Professional G-code — Polyslice v26.4 (44 printer profiles, 35 filament types)

Configurable settings — Layer height, infill density, wall thickness, support material

Print estimates — Accurate time & filament weight predictions

Download-ready — Export .gcode files for any 3D printer

Stack


Frontend: React 18, Three.js v0.184, Tailwind CSS, Vite
Backend: Node.js Express, OpenSCAD WASM
Slicing: Polyslice v26.4 (Three.js native integration)
LLM: Grok API (xAI)
Deployment: Vercel (frontend) + Railway (backend)


Quick Start

Prerequisites


Node.js 18+
Grok API key from x.ai


Local Development

bash# Clone the repo
git clone https://github.com/srinjoychinargoswami/thinkprintweb.git
cd thinkprintweb

# Install dependencies
npm install

# Create .env.local with your Grok API key
echo "XAI_API_KEY=your-grok-api-key-here" > .env.local

# Run dev server
npm run dev

# Open http://localhost:3000

How It Works


Describe — Enter a natural language prompt (e.g., "Make a 40mm watch with white dial")
Generate — Grok LLM creates parametric OpenSCAD code (editable)
Compile — OpenSCAD WASM compiles code to STL geometry
Preview — View in 3D (STL in gray, 3MF with full colors)
Configure — Adjust layer height (0.1-0.4mm), infill (5-100%), walls (1-8), support material
Select Printer — Choose from 15+ printer profiles (Ender3, Prusa i3 MK3S, CR10, Artillery, etc)
Slice — Polyslice generates professional G-code with accurate time/filament estimates
Download — Get .gcode file ready for 3D printer


Example Prompts

"Make a 10x10x10mm cube"
"Create a cylinder 20mm diameter, 30mm tall"
"Design a 40mm watch with white dial and red hands"
"Make a simple L-bracket 30x20x20mm"
"Design a hollow box with 2mm walls"

Deployment

Frontend (Vercel)

bashvercel deploy
# Auto-deploys on GitHub push

Backend (Railway)


Connect GitHub repo to Railway
Add environment variable in Railway dashboard:


   XAI_API_KEY = your-actual-grok-key


Deploy automatically


View Live


Frontend: https://thinkprintweb.vercel.app
Backend: Railway-generated URL


Project Structure

thinkprint/
├── src/
│   ├── components/          # React components
│   ├── App.tsx             # Main app
│   └── index.css           # Styles
├── server.ts               # Express backend
├── package.json
├── .env.local             # Local env (gitignored)
├── .env.example           # Example env template
└── README.md

Technologies Used


OpenSCAD WASM — Compile CAD code to STL in browser
Three.js — 3D visualization (STL gray, 3MF with colors)
Polyslice v26.4 — Professional G-code generation
Grok API — Natural language → OpenSCAD code
Express.js — Backend API server


Environment Variables

Create .env.local (gitignored):

Environment Variables

Create .env.local (gitignored):

XAI_API_KEY=your-grok-api-key-from-x-ai

See .env.example for template.

License: 
ThinkPrintWeb code is licensed under the Apache 2.0 License.

**Note:** This project uses [openscad-wasm](https://github.com/openscad/openscad-wasm) which is licensed under GPL v2. See [OpenSCAD License](https://github.com/openscad/openscad-wasm/blob/main/LICENSE) for details.
