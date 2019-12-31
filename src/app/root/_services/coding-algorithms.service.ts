import { Injectable } from '@angular/core';

import { Observable, of, ReplaySubject, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';

import {
  FrequencyDAlgorithm,
  Fsm,
  MiliFsm,
  MuraFsm,
  NStateAlgorithm,
  UnitaryDAlgorithm,
  VertexCodingAlgorithm,
} from '@app/models';
import { IFunctions, ITableConfig, ITableRow, TVertexData } from '@app/types';
import { CodingAlgorithmType, FsmType } from '@app/enums';
import { ExpressionConverterService } from './expression-converter.service';
import { ValidationError } from '@app/shared/_helpers/validation-error';
import { SignalOperandGeneratorService } from './signal-operand-generator.service';

@Injectable()
export class CodingAlgorithmsService {

  private static readonly DEFAULT_TIMEOUT: number = 1000;

  public readonly INVALID_ROWS_ERROR: string = 'INVALID_ROWS';
  public readonly INVALID_ROW_ERROR: string = 'INVALID_ROW';
  public readonly INVALID_INPUT_ERROR: string = 'INVALID_INPUT';
  public readonly INVALID_GRAPH_ERROR: string = 'INVALID_GRAPH';

  public get vertexCodes$(): Observable<TVertexData> {
    return this._vertexCodes$$.asObservable();
  }

  private _vertexCodes$$: ReplaySubject<TVertexData> = new ReplaySubject<TVertexData>(1);

  public get outputFunctions$(): Observable<IFunctions> {
    return this._outputFunctions$$.asObservable();
  }

  private _outputFunctions$$: ReplaySubject<IFunctions> = new ReplaySubject<IFunctions>(1);

  public get transitionFunctions$(): Observable<IFunctions> {
    return this._transitionFunctions$$.asObservable();
  }

  private _transitionFunctions$$: ReplaySubject<IFunctions> = new ReplaySubject<IFunctions>(1);

  public get capacity$(): Observable<number> {
    return this._capacity$$.asObservable();
  }

  private _capacity$$: ReplaySubject<number> = new ReplaySubject<number>(1);

  public get codedTableData$(): Observable<ITableRow[]> {
    return this._codedTableData$$.asObservable();
  }

  private _codedTableData$$: ReplaySubject<ITableRow[]> = new ReplaySubject<ITableRow[]>(1);

  public constructor(
    private readonly expressionConverterService: ExpressionConverterService,
    private readonly signalOperandGeneratorService: SignalOperandGeneratorService
  ) { }

  public code(
    selectedAlgorithm: CodingAlgorithmType,
    tableData: ITableRow[],
    tableConfig: Readonly<ITableConfig>
  ): Observable<void> {
    try {
      this.checkData(tableData, tableConfig);

      const stateCodingAlgorithm = this.getVertexCodingAlgorithm(selectedAlgorithm, tableData);
      const vertexCodeMap = stateCodingAlgorithm.getCodesMap();

      const codedTableData = this.getCodedTableData(tableData, vertexCodeMap);

      const fsm = this.getFsm(tableConfig.fsmType, codedTableData);

      const capacity: number = this.getCapacity(vertexCodeMap);

      const outputBooleanFunctions = fsm.getOutputBooleanFunctions();

      const outputShefferFunctions = this.expressionConverterService.convertBooleanFunctionsToSheffer(
        outputBooleanFunctions
      );

      const transitionBooleanFunctions = fsm.getExcitationBooleanFunctionsMap(capacity);
      const transitionShefferFunctions = this.expressionConverterService.convertBooleanFunctionsToSheffer(
        transitionBooleanFunctions
      );

      this._capacity$$.next(capacity);
      this._vertexCodes$$.next(vertexCodeMap);

      this._outputFunctions$$.next({
        boolean: outputBooleanFunctions,
        sheffer: outputShefferFunctions,
      });

      this._transitionFunctions$$.next({
        boolean: transitionBooleanFunctions,
        sheffer: transitionShefferFunctions,
      });

      this._codedTableData$$.next(codedTableData);

      return of(void 0).pipe(delay(CodingAlgorithmsService.DEFAULT_TIMEOUT));
    } catch (error) {
      return throwError({ key: error.key, params: error.params })
        .pipe(
          delay(CodingAlgorithmsService.DEFAULT_TIMEOUT)
        );
    }
  }

  private checkData(tableData: ITableRow[], tableConfig: Readonly<ITableConfig>): void {
    const invalidRows: number[] = this.getInvalidTableRows(tableData);

    if (invalidRows.length) {
      const errorKey = invalidRows.length > 1
        ? this.INVALID_ROWS_ERROR
        : this.INVALID_ROW_ERROR;

      throw new ValidationError(errorKey, { invalidRows });
    }

    if (!this.isGraphValid(tableData, tableConfig.numberOfStates)) {
      throw new ValidationError(this.INVALID_GRAPH_ERROR);
    }
  }

  private isGraphValid(tableData: ITableRow[], numberOfStates: number): boolean {
    const selectedSrcStateIds = tableData.map((tableRow) => tableRow.srcStateId);
    const selectedDistStateIds = tableData.map((tableRow) => tableRow.distStateId);

    const uniqueSelectedSrcStateIds = new Set(selectedSrcStateIds);
    const uniqueSelectedDistStateIds = new Set(selectedDistStateIds);

    return uniqueSelectedSrcStateIds.size === numberOfStates && uniqueSelectedDistStateIds.size === numberOfStates;
  }

  private getInvalidTableRows(tableData: ITableRow[]): number[] {
    return tableData
      .filter((tableRow: ITableRow) => {
        return !tableRow.distStateId
          || !tableRow.srcStateId
          || (!tableRow.unconditionalTransition && !tableRow.conditionalSignalsIds.size);
      })
      .map((tableRow: ITableRow) => tableRow.id);
  }

  private getVertexCodingAlgorithm(
    selectedAlgorithm: CodingAlgorithmType,
    tableData: ITableRow[]
  ): VertexCodingAlgorithm {
    const algorithmsMap = {
      [CodingAlgorithmType.UNITARY_D_TRIGGER]: UnitaryDAlgorithm,
      [CodingAlgorithmType.FREQUENCY_D_TRIGGER]: FrequencyDAlgorithm,
      [CodingAlgorithmType.STATE_N_D_TRIGGER]: NStateAlgorithm,
    };

    const algorithm = algorithmsMap[selectedAlgorithm];

    return new algorithm(tableData, this.signalOperandGeneratorService.getStates());
  }

  private getFsm(fsmType: FsmType, codedTableData: ITableRow[]): Fsm {
    const fsmMap = {
      [FsmType.MILI]: MiliFsm,
      [FsmType.MURA]: MuraFsm,
    };

    const fsm = fsmMap[fsmType];

    return new fsm(
      codedTableData,
      this.signalOperandGeneratorService.getStates(),
      this.signalOperandGeneratorService.getConditionalSignals()
    );
  }

  private getCodedTableData(tableData: ITableRow[], vertexCodeMap: Map<number, number>): ITableRow[] {
    return tableData.map(tableRow => {
      const distStateCode = vertexCodeMap.get(tableRow.distStateId as number) as number;
      const srcStateCode = vertexCodeMap.get(tableRow.srcStateId as number) as number;

      return {
        ...tableRow,
        distStateCode,
        srcStateCode,
        triggerExcitationSignals: distStateCode,
      };
    });
  }

  private getCapacity(vertexCodeMap: TVertexData): number {
    const maxValue: number = Math.max(...Array.from(vertexCodeMap.values()));
    return maxValue.toString(2).length;
  }
}