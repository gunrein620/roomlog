export class CreditFeedbackSequence {
  private activeToken = 0;

  begin(): number {
    this.activeToken += 1;
    return this.activeToken;
  }

  publish(token: number, publisher: () => void): boolean {
    if (token !== this.activeToken) return false;
    publisher();
    return true;
  }

  publishNow(publisher: () => void): void {
    const token = this.begin();
    this.publish(token, publisher);
  }
}
