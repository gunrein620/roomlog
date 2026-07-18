const cloneWallMask = wallMask => new Uint8Array(wallMask);

const cloneOpenings = openings => openings.map(opening => ({ ...opening }));

const cloneSnapshot = snapshot => ({
  wallMask: cloneWallMask(snapshot.wallMask),
  openings: cloneOpenings(snapshot.openings),
});

export class ReviewDocument {
  constructor(wallMask, openings, historyLimit = 30) {
    this.historyLimit = historyLimit;
    this.original = {
      wallMask: cloneWallMask(wallMask),
      openings: cloneOpenings(openings),
    };
    this.wallMask = cloneWallMask(wallMask);
    this.openings = cloneOpenings(openings);
    this.past = [];
    this.future = [];
    this.pending = null;
    this.revision = 1;
    this.renderedRevision = 0;
  }

  snapshot() {
    return {
      wallMask: cloneWallMask(this.wallMask),
      openings: cloneOpenings(this.openings),
    };
  }

  restore(snapshot) {
    this.wallMask = cloneWallMask(snapshot.wallMask);
    this.openings = cloneOpenings(snapshot.openings);
  }

  beginEdit() {
    if (this.pending) {
      return;
    }
    this.pending = this.snapshot();
  }

  commitEdit() {
    if (!this.pending) {
      return false;
    }

    this.past.push(cloneSnapshot(this.pending));
    if (this.past.length > this.historyLimit) {
      this.past.splice(0, this.past.length - this.historyLimit);
    }
    this.pending = null;
    this.future = [];
    this.revision += 1;
    return true;
  }

  cancelEdit() {
    if (!this.pending) {
      return false;
    }

    this.restore(this.pending);
    this.pending = null;
    return true;
  }

  undo() {
    const previous = this.past.pop();
    if (!previous) {
      return false;
    }

    this.future.push(this.snapshot());
    this.restore(previous);
    this.revision += 1;
    return true;
  }

  redo() {
    const next = this.future.pop();
    if (!next) {
      return false;
    }

    this.past.push(this.snapshot());
    this.restore(next);
    this.revision += 1;
    return true;
  }

  reset() {
    this.beginEdit();
    this.restore(this.original);
    return this.commitEdit();
  }

  markRendered() {
    this.renderedRevision = this.revision;
  }

  needsCompose() {
    return this.renderedRevision !== this.revision;
  }

  get undoDepth() {
    return this.past.length;
  }
}
