import { DnfEquation, ShefferEquation } from '@app/models';

export interface IOutputFunctionsDataCell {
  index: number;
  dnfEquation: DnfEquation;
  shefferEquation: ShefferEquation;
}
