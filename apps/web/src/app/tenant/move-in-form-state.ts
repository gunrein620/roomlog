export type MoveInChecklistFormState = {
  area: string;
  itemName: string;
  memo: string;
};

export function initialMoveInChecklistForm(): MoveInChecklistFormState {
  return {
    area: "",
    itemName: "",
    memo: ""
  };
}
