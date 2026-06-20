import { CADDesign, CADVisualNode } from "../types";

export const TEMPLATES: CADDesign[] = [
  {
    id: "template_bracket",
    prompt: "Mounting Bracket with screw holes",
    createdAt: new Date().toISOString(),
    parameters: [
      { name: "width", default: 80, min: 40, max: 150, step: 5, description: "Total width of mounting bracket" },
      { name: "depth", default: 50, min: 30, max: 100, step: 5, description: "Total depth of mounting bracket" },
      { name: "thickness", default: 12, min: 5, max: 30, step: 1, description: "Thickness of bracket plate" },
      { name: "hole_diameter", default: 4.5, min: 2, max: 10, step: 0.5, description: "Screw hole drilling diameter" },
      { name: "hole_offset", default: 8, min: 4, max: 18, step: 1, description: "Drill inset border distance" },
    ],
    openscad: `// --- ThinkPrint Parametric Mounting Bracket ---
width = 80; // [40:5:150]
depth = 50; // [30:5:100]
thickness = 12; // [5:1:30]
hole_diameter = 4.5; // [2:0.5:10]
hole_offset = 8; // [4:1:18]
$fn = 60;

module mounting_bracket() {
    difference() {
        // Base plate solid slab
        cube([width, depth, thickness], center=false);
        
        // Subtract 4 corner mounting screw drills
        translate([hole_offset, hole_offset, -1])
            cylinder(h=thickness + 2, d=hole_diameter);
            
        translate([width - hole_offset, hole_offset, -1])
            cylinder(h=thickness + 2, d=hole_diameter);
            
        translate([hole_offset, depth - hole_offset, -1])
            cylinder(h=thickness + 2, d=hole_diameter);
            
        translate([width - hole_offset, depth - hole_offset, -1])
            cylinder(h=thickness + 2, d=hole_diameter);
    }
}

mounting_bracket();`,
    visualTree: {
      type: "difference",
      children: [
        {
          type: "cube",
          size: ["width", "depth", "thickness"],
          center: false,
          color: "#475569", // slate gray
        },
        {
          type: "cylinder",
          h: "thickness + 2",
          d: "hole_diameter",
          translate: ["hole_offset", "hole_offset", -1],
          color: "#ef4444",
          subtract: true,
        },
        {
          type: "cylinder",
          h: "thickness + 2",
          d: "hole_diameter",
          translate: ["width - hole_offset", "hole_offset", -1],
          color: "#ef4444",
          subtract: true,
        },
        {
          type: "cylinder",
          h: "thickness + 2",
          d: "hole_diameter",
          translate: ["hole_offset", "depth - hole_offset", -1],
          color: "#ef4444",
          subtract: true,
        },
        {
          type: "cylinder",
          h: "thickness + 2",
          d: "hole_diameter",
          translate: ["width - hole_offset", "depth - hole_offset", -1],
          color: "#ef4444",
          subtract: true,
        },
      ],
    },
  },
  {
    id: "template_organizer",
    prompt: "Grid Compartments Desk Organizer",
    createdAt: new Date().toISOString(),
    parameters: [
      { name: "length", default: 120, min: 80, max: 200, step: 10, description: "Total outer length" },
      { name: "width", default: 80, min: 50, max: 150, step: 5, description: "Total outer width" },
      { name: "height", default: 40, min: 20, max: 100, step: 5, description: "Tray compartment height" },
      { name: "wall_thickness", default: 3, min: 1.5, max: 8, step: 0.5, description: "Enclosure slot shell depth" },
    ],
    openscad: `// --- ThinkPrint Parametric desk tray compartment ---
length = 120; // [80:10:200]
width = 80; // [50:5:150]
height = 40; // [20:5:100]
wall_thickness = 3; // [1.5:0.5:8]
$fn = 60;

module desk_tray() {
    difference() {
        // Main solid shell block
        cube([length, width, height], center=false);
        
        // Scoop compartment left
        translate([wall_thickness, wall_thickness, wall_thickness])
            cube([(length - wall_thickness * 3) / 2, width - wall_thickness * 2, height], center=false);
            
        // Scoop compartment right
        translate([length / 2 + wall_thickness / 2, wall_thickness, wall_thickness])
            cube([(length - wall_thickness * 3) / 2, width - wall_thickness * 2, height], center=false);
    }
}

desk_tray();`,
    visualTree: {
      type: "difference",
      children: [
        {
          type: "cube",
          size: ["length", "width", "height"],
          center: false,
          color: "#0891b2", // Cyan organizer
        },
        // Left cutout slot
        {
          type: "cube",
          size: [
            "(length - wall_thickness * 3) / 2",
            "width - wall_thickness * 2",
            "height"
          ],
          center: false,
          translate: ["wall_thickness", "wall_thickness", "wall_thickness"],
          color: "#fbbf24",
          subtract: true,
        },
        // Right cutout slot
        {
          type: "cube",
          size: [
            "(length - wall_thickness * 3) / 2",
            "width - wall_thickness * 2",
            "height"
          ],
          center: false,
          translate: ["length / 2 + wall_thickness / 2", "wall_thickness", "wall_thickness"],
          color: "#fbbf24",
          subtract: true,
        },
      ],
    },
  },
  {
    id: "template_watch",
    prompt: "Parametric Clock Watch Bezel",
    createdAt: new Date().toISOString(),
    parameters: [
      { name: "diameter", default: 46, min: 30, max: 80, step: 2, description: "Dial outer face circle" },
      { name: "thickness", default: 10, min: 4, max: 25, step: 1, description: "Bezel block absolute depth" },
      { name: "inner_scale", default: 38, min: 20, max: 70, step: 2, description: "Inner dial cutout face width" },
      { name: "bead_dia", default: 3, min: 1, max: 6, step: 0.5, description: "Bezel indicator dials diameter" },
    ],
    openscad: `// --- ThinkPrint Chronos Clock Case Bezel ---
diameter = 46; // [30:2:80]
thickness = 10; // [4:1:25]
inner_scale = 38; // [20:2:70]
bead_dia = 3; // [1:0.5:6]
$fn = 80;

module watch_bezel() {
    difference() {
        // Core watch face
        cylinder(h=thickness, d=diameter, center=false);
        
        // Carve core void space for the dial lens glass
        translate([0, 0, 2])
            cylinder(h=thickness + 1, d=inner_scale, center=false);
            
        // Top edge 12-o-clock indicator drill void
        translate([0, diameter/2 - 2, thickness - 1])
            sphere(d=bead_dia);
    }
}

watch_bezel();`,
    visualTree: {
      type: "difference",
      children: [
        {
          type: "cylinder",
          h: "thickness",
          d: "diameter",
          center: false,
          color: "#b45309", // Gold/Amber Bezel
        },
        {
          type: "cylinder",
          h: "thickness + 1",
          d: "inner_scale",
          center: false,
          translate: [0, 0, 2],
          color: "#ef4444",
          subtract: true,
        },
        {
          type: "sphere",
          d: "bead_dia",
          translate: [0, "diameter / 2 - 2", "thickness - 1"],
          color: "#ffffff",
          subtract: true,
        },
      ],
    },
  },
  {
    id: "template_gear",
    prompt: "Mechanical Drive Pinion Gear",
    createdAt: new Date().toISOString(),
    parameters: [
      { name: "outer_dia", default: 60, min: 30, max: 120, step: 2, description: "Extremity teeth circle diameter" },
      { name: "height", default: 15, min: 4, max: 40, step: 1, description: "Gear depth extrusion" },
      { name: "axle_bore", default: 8, min: 3, max: 20, step: 1, description: "Center drive shaft bore hole" },
      { name: "teeth", default: 12, min: 4, max: 24, step: 1, description: "Extruded drive teeth count" },
    ],
    openscad: `// --- ThinkPrint Parametric Pinion spur gear ---
outer_dia = 60; // [30:2:120]
height = 15; // [4:1:40]
axle_bore = 8; // [3:1:20]
teeth = 12; // [4:1:24]
$fn = 60;

module spur_gear() {
    difference() {
        union() {
            // Main dynamic core cylinder
            cylinder(h=height, d=outer_dia * 0.85, center=false);
            
            // Generate mechanical teeth around the dial
            for(i=[0:11]) { // teeth boundary reference
                rotate([0, 0, i * 360 / teeth])
                    translate([outer_dia * 0.38, 0, 0])
                        cube([outer_dia * 0.15, outer_dia * 0.08, height], center=true);
            }
        }
        
        // Axial keyway drive rod hole
        translate([0, 0, -1])
            cylinder(h=height + 2, d=axle_bore, center=false);
    }
}

spur_gear();`,
    visualTree: {
      type: "difference",
      children: [
        {
          type: "union",
          children: [
            {
              type: "cylinder",
              h: "height",
              d: "outer_dia * 0.82",
              center: false,
              color: "#4f46e5", // Indigo gear
            },
            // Tooth 1
            {
              type: "cube",
              size: ["outer_dia * 0.16", "outer_dia * 0.08", "height"],
              translate: ["outer_dia * 0.38", 0, "height / 2"],
              center: true,
              color: "#4f46e5",
            },
            // Rotate tooths simulation
            {
              type: "cube",
              size: ["outer_dia * 0.16", "outer_dia * 0.08", "height"],
              translate: [0, "outer_dia * 0.38", "height / 2"],
              rotate: [0, 0, 90],
              center: true,
              color: "#4f46e5",
            },
            {
              type: "cube",
              size: ["outer_dia * 0.16", "outer_dia * 0.08", "height"],
              translate: ["-(outer_dia * 0.38)", 0, "height / 2"],
              rotate: [0, 0, 180],
              center: true,
              color: "#4f46e5",
            },
            {
              type: "cube",
              size: ["outer_dia * 0.16", "outer_dia * 0.08", "height"],
              translate: [0, "-(outer_dia * 0.38)", "height / 2"],
              rotate: [0, 0, 270],
              center: true,
              color: "#4f46e5",
            },
            // Diagonals tooth helper
            {
              type: "cube",
              size: ["outer_dia * 0.16", "outer_dia * 0.08", "height"],
              translate: ["outer_dia * 0.27", "outer_dia * 0.27", "height / 2"],
              rotate: [0, 0, 45],
              center: true,
              color: "#4f46e5",
            },
            {
              type: "cube",
              size: ["outer_dia * 0.16", "outer_dia * 0.08", "height"],
              translate: ["-(outer_dia * 0.27)", "outer_dia * 0.27", "height / 2"],
              rotate: [0, 0, 135],
              center: true,
              color: "#4f46e5",
            },
            {
              type: "cube",
              size: ["outer_dia * 0.16", "outer_dia * 0.08", "height"],
              translate: ["-(outer_dia * 0.27)", "-(outer_dia * 0.27)", "height / 2"],
              rotate: [0, 0, 225],
              center: true,
              color: "#4f46e5",
            },
            {
              type: "cube",
              size: ["outer_dia * 0.16", "outer_dia * 0.08", "height"],
              translate: ["outer_dia * 0.27", "-(outer_dia * 0.27)", "height / 2"],
              rotate: [0, 0, 315],
              center: true,
              color: "#4f46e5",
            },
          ],
        },
        {
          type: "cylinder",
          h: "height + 2",
          d: "axle_bore",
          center: false,
          translate: [0, 0, -1],
          color: "#ffffff",
          subtract: true,
        },
      ],
    },
  },
];
