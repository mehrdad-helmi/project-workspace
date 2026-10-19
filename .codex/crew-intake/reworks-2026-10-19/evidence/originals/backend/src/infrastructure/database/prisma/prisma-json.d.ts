/** Canonical contracts for domain JSON fields. Imported only for types. */
import type {
	StringMap as StringMapContract,
	PricingAdjustments as PricingAdjustmentsContract,
} from '../../../modules/contacts';
import type { StandardEstimationDto as StandardEstimationContract } from '../../../modules/estimation/types/estimation-json.contracts';
import type { DiscountsAndFactorsDto as DiscountsAndFactorsContract } from '../../../modules/estimation/types/estimation-json.contracts';
import type { SpecialPrices as SpecialPricesContract } from '../../../modules/estimation/types/estimation-json.contracts';
import type { LaborOperationRecords as LaborOperationRecordsContract } from '../../../modules/estimation/types/labor-json.contracts';
import type { LaborCategoryRecords as LaborCategoryRecordsContract } from '../../../modules/estimation/types/labor-json.contracts';
import type { SystemPreferencesDto as SystemPreferencesContract } from '../../../modules/preferences/types/preference-json.contracts';
import type { ColorPreferencesDto as ColorPreferencesContract } from '../../../modules/preferences/types/preference-json.contracts';
import type { FillingPreferencesDto as FillingPreferencesContract } from '../../../modules/preferences/types/preference-json.contracts';
import type { OtherPreferencesDto as OtherPreferencesContract } from '../../../modules/preferences/types/preference-json.contracts';
import type { DeferredEngineeringInput as DeferredEngineeringInputContract } from '../../../modules/positions/types/position-json.contracts';
import type { DeferredCalculationSummary as DeferredCalculationSummaryContract } from '../../../modules/positions/types/position-json.contracts';
import type { PositionActivityDetailsDto as PositionActivityDetailsContract } from '../../../modules/positions/types/position-json.contracts';
import type { PositionIssueDetailsDto as PositionIssueDetailsContract } from '../../../modules/positions/types/position-json.contracts';
import type { PrintoutGenerationInputs as PrintoutGenerationInputsContract } from '../../../modules/printouts/types/printout-json.contracts';
import type { PrintoutGenerationOptions as PrintoutGenerationOptionsContract } from '../../../modules/printouts/types/printout-json.contracts';

declare global {
	namespace PrismaJson {
		type StringMap = StringMapContract;
		type PricingAdjustments = PricingAdjustmentsContract;
		type StandardEstimation = StandardEstimationContract;
		type DiscountsAndFactors = DiscountsAndFactorsContract;
		type SpecialPrices = SpecialPricesContract;
		type LaborOperationRecords = LaborOperationRecordsContract;
		type LaborCategoryRecords = LaborCategoryRecordsContract;
		type SystemPreferences = SystemPreferencesContract;
		type ColorPreferences = ColorPreferencesContract;
		type FillingPreferences = FillingPreferencesContract;
		type OtherPreferences = OtherPreferencesContract;
		type DeferredEngineeringInput = DeferredEngineeringInputContract;
		type DeferredCalculationSummary = DeferredCalculationSummaryContract;
		type PositionActivityDetails = PositionActivityDetailsContract;
		type PositionIssueDetails = PositionIssueDetailsContract;
		type PrintoutGenerationInputs = PrintoutGenerationInputsContract;
		type PrintoutGenerationOptions = PrintoutGenerationOptionsContract;
	}
}
export {};
