import { SignalOperand } from "./signal-operand";

export class StateOperand extends SignalOperand {
  public sign: string = 'a';

  public copy(): App.SignalOperand {
    return new StateOperand(this.id, this.inverted);
  }
}