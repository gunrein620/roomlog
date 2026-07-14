export type TicketActionMenuPlacement = "top" | "bottom";

export type TicketActionMenuPlacementInput = {
  trigger: {
    top: number;
    right: number;
    bottom: number;
  };
  menu: {
    width: number;
    height: number;
  };
  viewport: {
    width: number;
    height: number;
  };
  gap: number;
};

export type TicketActionMenuPosition = {
  top: number;
  left: number;
  placement: TicketActionMenuPlacement;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function placeTicketActionMenu({
  trigger,
  menu,
  viewport,
  gap,
}: TicketActionMenuPlacementInput): TicketActionMenuPosition {
  const belowTop = trigger.bottom + gap;
  const aboveTop = trigger.top - gap - menu.height;
  const availableBelow = viewport.height - gap - belowTop;
  const availableAbove = trigger.top - gap;
  const placement: TicketActionMenuPlacement =
    availableBelow >= menu.height || availableBelow >= availableAbove
      ? "bottom"
      : "top";
  const preferredTop = placement === "bottom" ? belowTop : aboveTop;

  return {
    top: clamp(preferredTop, gap, viewport.height - gap - menu.height),
    left: clamp(
      trigger.right - menu.width,
      gap,
      viewport.width - gap - menu.width,
    ),
    placement,
  };
}
