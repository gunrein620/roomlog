export type RealtimePersistState = {
  isPersisting: boolean;
  pendingEventId: string;
  persistedEventId: string;
};

export type BeginRealtimePersistResult = {
  state: RealtimePersistState;
  shouldPersist: boolean;
};

export function emptyRealtimePersistState(): RealtimePersistState {
  return {
    isPersisting: false,
    pendingEventId: "",
    persistedEventId: ""
  };
}

export function beginRealtimeTurnPersist(
  currentState: RealtimePersistState,
  eventId = ""
): BeginRealtimePersistResult {
  if (currentState.isPersisting) {
    return { state: currentState, shouldPersist: false };
  }

  if (eventId && currentState.persistedEventId === eventId) {
    return { state: currentState, shouldPersist: false };
  }

  return {
    state: {
      ...currentState,
      isPersisting: true,
      pendingEventId: eventId
    },
    shouldPersist: true
  };
}

export function completeRealtimeTurnPersist(
  currentState: RealtimePersistState,
  eventId = "",
  succeeded: boolean
): RealtimePersistState {
  return {
    isPersisting: false,
    pendingEventId: "",
    persistedEventId: succeeded && eventId ? eventId : currentState.persistedEventId
  };
}
