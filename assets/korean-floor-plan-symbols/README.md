# Korean Floor Plan Symbols

Project-owned reference symbols for Korean apartment, villa, and officetel floor-plan object extraction.

These SVGs are intentionally simple line symbols. They are not copied from external icon packs. Use them as:

- visual reference sheets for OpenAI floor-plan analysis
- class definitions for object extraction prompts
- seed assets for synthetic rotation/scale/noise variants
- overlay icons when reviewing extracted floor-plan objects

## Policy

- Doors split wall continuity.
- Windows keep wall continuity.
- Fixtures become objects, not walls.
- Furniture is ignored unless it is a built-in fixture.
- Floor regions are used only to distinguish home/interior regions from non-home/excluded regions.

## Initial Classes

- `swingDoor`
- `doubleSwingDoor`
- `slidingDoor`
- `pocketDoor`
- `window`
- `balconyWindow`
- `toilet`
- `sink`
- `bathtub`
- `showerBooth`
- `floorDrain`
- `kitchenSink`
- `gasRange`
- `refrigerator`
- `stairs`
- `elevator`
- `column`

