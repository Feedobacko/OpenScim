// The rules by which the game client drags an inventory item, in the
// coordinates of the inventory component (interface 149:0, 190 by 261).
//
// Where each number comes from:
// - clientscript 6007 creates the 28 slots: 36 by 32, drag dead zone 5, drag
//   dead time 6. Clientscript 6010 places them at 16 + column * 42,
//   8 + row * 36.
// - The client's drag routine counts one client cycle (20ms) per pass while
//   the button is held. The slot becomes a drag once that count is above the
//   dead time and the slot has moved more than the dead zone on either axis.
//   The slot keeps the offset at which it was grabbed and cannot leave the
//   component, so the movement is measured after that clamp.
// - On release the drop target is the slot under the cursor, never the
//   dragged slot itself. Clientscript 6013 then redraws the two slots swapped
//   at once. Between two slots there is no target, and nothing happens.
export const INVENTORY_WIDTH = 190;
export const INVENTORY_HEIGHT = 261;
export const SLOT_WIDTH = 36;
export const SLOT_HEIGHT = 32;
export const DRAG_DEAD_ZONE = 5;
// ponytail: the press is taken to land on a cycle boundary. In the client it
// lands up to 20ms before one, so a drag starts 120 to 140ms after the press.
export const DRAG_DEAD_TIME_MS = 120;

const COLUMNS = 4;
const ROWS = 7;
const COLUMN_PITCH = 42;
const ROW_PITCH = 36;
const FIRST_SLOT_X = 16;
const FIRST_SLOT_Y = 8;

export function slotPosition(index) {
  return {
    x: FIRST_SLOT_X + (index % COLUMNS) * COLUMN_PITCH,
    y: FIRST_SLOT_Y + Math.floor(index / COLUMNS) * ROW_PITCH,
  };
}

// The slot under a point, or null in the gaps between slots and outside them.
export function slotAt(x, y) {
  const column = Math.floor((x - FIRST_SLOT_X) / COLUMN_PITCH);
  const row = Math.floor((y - FIRST_SLOT_Y) / ROW_PITCH);
  if (column < 0 || column >= COLUMNS || row < 0 || row >= ROWS) {
    return null;
  }
  if (
    x - FIRST_SLOT_X - column * COLUMN_PITCH >= SLOT_WIDTH ||
    y - FIRST_SLOT_Y - row * ROW_PITCH >= SLOT_HEIGHT
  ) {
    return null;
  }
  return row * COLUMNS + column;
}

// Where the held slot is drawn while the cursor is at `cursor`, having been
// pressed at `press`.
export function dragPosition(index, press, cursor) {
  const origin = slotPosition(index);
  const clamp = (value, max) => Math.max(0, Math.min(max, value));
  return {
    x: clamp(origin.x + cursor.x - press.x, INVENTORY_WIDTH - SLOT_WIDTH),
    y: clamp(origin.y + cursor.y - press.y, INVENTORY_HEIGHT - SLOT_HEIGHT),
  };
}

export function isDragStarted(
  index,
  press,
  cursor,
  heldMs,
  deadTimeMs = DRAG_DEAD_TIME_MS,
) {
  if (heldMs < deadTimeMs) {
    return false;
  }
  const origin = slotPosition(index);
  const position = dragPosition(index, press, cursor);
  return (
    Math.abs(position.x - origin.x) > DRAG_DEAD_ZONE ||
    Math.abs(position.y - origin.y) > DRAG_DEAD_ZONE
  );
}
