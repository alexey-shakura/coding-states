import { Injectable } from '@angular/core';
import { Observable, of, ReplaySubject, Subject, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { FsmFactory, TableCoderFactory } from '@app/models';
import {
  IExcitationFunctionsDataCell,
  IOutputFunctionsDataCell,
  ITableConfig,
  ITableRow,
  IVertexCodingAlgorithm,
  TVertexData
} from '@app/types';
import { ValidationError } from '@app/shared/_helpers/validation-error';
import { SignalOperandGeneratorService } from './signal-operand-generator.service';
import { ConditionalsFlowValidatorService } from './conditionals-flow-validator.service';
import { TableDataValidatorService } from './table-data-validator.service';

@Injectable()
export class CodingAlgorithmsService {

  private static readonly DEFAULT_TIMEOUT: number = 1000;

  public get vertexCodes$(): Observable<TVertexData> {
    return this._vertexCodes$$.asObservable();
  }

  private _vertexCodes$$: ReplaySubject<TVertexData> = new ReplaySubject<TVertexData>(1);

  public get outputFunctions$(): Observable<IOutputFunctionsDataCell[]> {
    return this._outputFunctions$$.asObservable();
  }

  private _outputFunctions$$: ReplaySubject<IOutputFunctionsDataCell[]> = new ReplaySubject<IOutputFunctionsDataCell[]>(1);

  public get transitionFunctions$(): Observable<IExcitationFunctionsDataCell[]> {
    return this._transitionFunctions$$.asObservable();
  }

  private _transitionFunctions$$: ReplaySubject<IExcitationFunctionsDataCell[]> = new ReplaySubject<IExcitationFunctionsDataCell[]>(1);

  public get capacity$(): Observable<number> {
    return this._capacity$$.asObservable();
  }

  private _capacity$$: ReplaySubject<number> = new ReplaySubject<number>(1);

  public get codedTableData$(): Observable<ITableRow[]> {
    return this._codedTableData$$.asObservable();
  }

  private _codedTableData$$: ReplaySubject<ITableRow[]> = new ReplaySubject<ITableRow[]>(1);

  public get warnings$(): Observable<ValidationError[]> {
    return this._warnings$$.asObservable();
  }

  private _warnings$$: Subject<ValidationError[]> = new Subject<ValidationError[]>();

  public constructor(
    private readonly conditionalsFlowValidatorService: ConditionalsFlowValidatorService,
    private readonly signalOperandGeneratorService: SignalOperandGeneratorService,
    private readonly tableDataValidatorService: TableDataValidatorService
  ) { }

  public code(
    vertexCodingAlgorithm: IVertexCodingAlgorithm,
    tableData: ITableRow[],
    tableConfig: Readonly<ITableConfig>
  ): Observable<void> {
    try {
      this.tableDataValidatorService.validate(tableData, tableConfig);

      this.checkConditionalsFlow(tableConfig, tableData);

      const vertexCodeMap = vertexCodingAlgorithm.getCodesMap();

      const codedTableData = this.getCodedTableData(tableData, tableConfig, vertexCodeMap);

      const fsm = FsmFactory.create(
        tableConfig.fsmType,
        codedTableData,
        this.signalOperandGeneratorService.getStates(),
        this.signalOperandGeneratorService.getConditionalSignals(),
        this.signalOperandGeneratorService.getOutputSignals()
      );

      const capacity = this.getCapacity(vertexCodeMap);

      const outputFunction = fsm.getOutputFunctions();
      const excitationFunctions = fsm.getExcitationFunctions(capacity);

      this._capacity$$.next(capacity);
      this._vertexCodes$$.next(vertexCodeMap);

      this._outputFunctions$$.next(outputFunction);
      this._transitionFunctions$$.next(excitationFunctions);

      this._codedTableData$$.next(codedTableData);

      return of(void 0)
        .pipe(
          delay(CodingAlgorithmsService.DEFAULT_TIMEOUT)
        );
    } catch (error) {
      return throwError(error)
        .pipe(
          delay(CodingAlgorithmsService.DEFAULT_TIMEOUT)
        );
    }
  }

  private checkConditionalsFlow(tableConfig: Readonly<ITableConfig>, tableData: ITableRow[]): void {
    const warnings = this.conditionalsFlowValidatorService.validate(tableConfig, tableData);
    this._warnings$$.next(warnings);
  }

  private getCodedTableData(
    tableData: ITableRow[],
    tableConfig: ITableConfig,
    vertexCodeMap: Map<number, number>
  ): ITableRow[] {
    const tableCoder = TableCoderFactory.create(tableConfig.triggerType);
    return tableCoder.code(tableData, vertexCodeMap);
  }

  private getCapacity(vertexCodeMap: TVertexData): number {
    const maxValue: number = Math.max(...Array.from(vertexCodeMap.values()));

    return maxValue.toString(2).length;
  }

}
