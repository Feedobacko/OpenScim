var TickEventBuffer = class {
  eventBuffer = [];
  nextEventId = 1;
  currentTick = 0;
  constructor() {
  }
  setCurrentTick(tick) {
    this.currentTick = tick;
  }
  emit(event) {
    const stampedEvent = {
      ...event,
      tick: this.currentTick,
      eventId: this.nextEventId,
    };
    this.eventBuffer.push(stampedEvent);
    this.nextEventId += 1;
  }
  advanceNextEventIdPast(lastEventId) {
    this.nextEventId = Math.max(this.nextEventId, lastEventId + 1);
  }
  flush() {
    const flushedEvents = [...this.eventBuffer];
    this.eventBuffer = [];
    return flushedEvents;
  }
};
export { TickEventBuffer };
