import { Injectable } from '@angular/core';

import { Observable } from 'rxjs/Observable';
import { ReplaySubject } from 'rxjs/ReplaySubject';

import { BaseFsmCoder } from '../coding-algorithms/fsm-coder/base-fsm-coder';
import { ConditionSignalOperand } from '../shared/expression/condition-signal-operand';
import { ConjunctiveExpression } from '../shared/expression/conjunctive-expression';
import { DisjunctiveExpression } from '../shared/expression/disjunctive-expression';
import { Expression } from '../shared/expression/expression';
import { FrequencyDAlgorithm } from '../coding-algorithms/algorithms/frequency-d-algorithm';
import { MiliCoder } from '../coding-algorithms/fsm-coder/mili-coder';
import { MuraCoder } from '../coding-algorithms/fsm-coder/mura-coder';
import { NStateAlgorithm } from '../coding-algorithms/algorithms/n-state-d-algorithm';
import { OneOperand } from '../shared/expression/one-operand';
import { Operand } from '../shared/expression/operand';
import { ShefferExpression } from '../shared/expression/sheffer-expression';
import { SignalOperand } from '../shared/expression/signal-operand';
import { StateOperand } from '../shared/expression/state-operand';
import { TableDataService } from './table-data.service';
import { UnitaryDAlgorithm } from '../coding-algorithms/algorithms/unitary-d-algorithm';


@Injectable()
export class CodingAlgorithmsService {

  public static readonly UNITARY_D_ALGORITHM: string = 'unitary';
  public static readonly FREQUENCY_D_ALGORITHM: string = 'frequency';
  public static readonly STATE_N_D_ALGORITHM: string = 'by_num_state';

  public static readonly DEFAULT_TIMEOUT: number = 1000;

  public static readonly D_TRIGGER_MODE: string = 'D';

  public get triggerMode$(): Observable<string> {
    return this._triggerMode$$.asObservable();
  }

  private _triggerMode$$: ReplaySubject<string> = new ReplaySubject<string>(1);

  public get vertexCodes$(): Observable<App.TVertexData> {
    return this._vertexCodes$$.asObservable();
  }

  private _vertexCodes$$: ReplaySubject<App.TVertexData> = new ReplaySubject<App.TVertexData>(1);

  public get outputBooleanFunctions$(): Observable<Map<number, App.Expression>> {
    return this._outputBooleanFunctions$$.asObservable();
  }

  private _outputBooleanFunctions$$: ReplaySubject<App.TFunctionMap> = new ReplaySubject<App.TFunctionMap>(1);

  public get transitionBooleanFunctions$(): Observable<App.TFunctionMap> {
    return this._transitionBooleanFunctions$$.asObservable();
  }

  private _transitionBooleanFunctions$$: ReplaySubject<App.TFunctionMap> = new ReplaySubject<App.TFunctionMap>(1);

  public get capacity$(): Observable<number> {
    return this._capacity$$.asObservable();
  }

  private _capacity$$: ReplaySubject<number> = new ReplaySubject<number>(1);

  private _algorithmMap: { [propName: string]: App.ICodingAlgorithm } = {
    [CodingAlgorithmsService.UNITARY_D_ALGORITHM]: new UnitaryDAlgorithm(),
    [CodingAlgorithmsService.FREQUENCY_D_ALGORITHM]: new FrequencyDAlgorithm(),
    [CodingAlgorithmsService.STATE_N_D_ALGORITHM]: new NStateAlgorithm()
  };

  private _fsmMap: { [propName: string]: BaseFsmCoder } = {
    [TableDataService.MILI_FSM_TYPE]: new MiliCoder(),
    [TableDataService.MURA_FSM_TYPE]: new MuraCoder()
  };

  public code(algorithm: string, tableData: App.TableRow[], tableConfig: Readonly<App.TableConfig>): Observable<void> {
    const invalidRows: number[] = this.checkTableData(tableData);

    if (invalidRows.length) {
      return Observable.throw(invalidRows)
        .delay(CodingAlgorithmsService.DEFAULT_TIMEOUT);
    }

    if (!this._algorithmMap[algorithm] || !this._fsmMap[tableConfig.fsmType]) {
      return Observable.throw(null)
        .delay(CodingAlgorithmsService.DEFAULT_TIMEOUT);
    }

    const algorithmCoder = this._algorithmMap[algorithm];
    const fsmCoder = this._fsmMap[tableConfig.fsmType];

    const vertexCodeMap = algorithmCoder.getVertexCodeMap(tableData, tableConfig.numberOfStates);
    const capacity = algorithmCoder.getCapacity(tableConfig.numberOfStates);

    this._capacity$$.next(capacity);
    this._vertexCodes$$.next(vertexCodeMap);
    this._outputBooleanFunctions$$.next(fsmCoder.getOutputBooleanFunctions(tableData));
    this._transitionBooleanFunctions$$.next(fsmCoder.getTransitionBooleanFunctions(tableData, vertexCodeMap, capacity));

    return Observable.of(null)
      .delay(CodingAlgorithmsService.DEFAULT_TIMEOUT);
  }

  public checkTableData(tableData: App.TableRow[]): number[] {
    return tableData
      .filter((tableRow: App.TableRow) => {
        return !tableRow.distState
          || !tableRow.srcState
          || (!tableRow.unconditionalX && !tableRow.x.size);
      })
      .map((tableRow: App.TableRow) => tableRow.id);
  }

  // DNF -> Sheffer Basis
  public convertToShefferBasis(expression: App.Expression): ShefferExpression {
    const shefferExpression: ShefferExpression = new ShefferExpression([]);

    if (expression.operands.length === 1) {
      if (expression.operands[0] instanceof Operand) {
        shefferExpression.addOperand((expression.operands[0] as App.Operand).copy());
      }

      if (expression.operands[0] instanceof Expression) {
        shefferExpression.addOperand(
          new ShefferExpression((expression.operands[0] as App.Expression).operands)
        );

        if ((expression.operands[0] as App.Expression).operands.length > 1) {
          shefferExpression.addOperand(new OneOperand());
        }
      }

      return shefferExpression;
    }

    expression.operands.forEach((operand) => {
      if (operand instanceof Expression) {
        shefferExpression.addOperand(new ShefferExpression(operand.operands));
      }

      if (operand instanceof SignalOperand) {
        const newOperand: SignalOperand = operand.copy() as App.SignalOperand;
        newOperand.inverted = !newOperand.inverted;

        shefferExpression.addOperand(newOperand);
      }
    });

    return shefferExpression;
  }
}
