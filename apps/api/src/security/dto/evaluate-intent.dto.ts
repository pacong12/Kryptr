import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CHAINS,
  type ChainId,
  type SwapContext,
  type TransactionIntent,
} from '@kryptr/shared-types';
import { ADDRESS_PATTERN } from '../../common/address';

const INTENT_KINDS = ['transfer', 'swap', 'deploy', 'approve'] as const;

/**
 * Wire shape of SwapContext — required on kind='swap' intents, binds the
 * intent to exactly one quote (single-use).
 */
export class SwapContextDto implements SwapContext {
  @IsString()
  @IsNotEmpty()
  quoteId!: string;

  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @Matches(ADDRESS_PATTERN)
  buyAsset!: `0x${string}` | null;

  @IsString()
  @IsNotEmpty()
  minBuyAmount!: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  maxSlippageBps!: number;

  @IsDateString()
  quoteExpiresAt!: string;
}

/**
 * Wire shape of a TransactionIntent. Origin is still client-supplied in
 * Wave 2 (no auth yet); server-side origin stamping from the
 * authenticated session is the logged wave-3 item (threat model req. 2).
 */
export class EvaluateIntentDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  walletId!: string;

  @IsIn(CHAINS)
  chain!: ChainId;

  @IsIn(INTENT_KINDS)
  kind!: TransactionIntent['kind'];

  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @Matches(ADDRESS_PATTERN)
  to!: `0x${string}` | null;

  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @Matches(ADDRESS_PATTERN)
  asset!: `0x${string}` | null;

  @IsString()
  @IsNotEmpty()
  amount!: string;

  @IsString()
  @IsNotEmpty()
  origin!: string;

  @ValidateIf((dto) => dto.kind === 'swap')
  @ValidateNested()
  @Type(() => SwapContextDto)
  swap?: SwapContextDto;

  @IsDateString()
  createdAt!: string;
}
