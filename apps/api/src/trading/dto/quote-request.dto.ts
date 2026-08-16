import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { CHAINS, type ChainId, type QuoteRequest } from '@kryptr/shared-types';
import { ADDRESS_PATTERN } from '../../common/address';

/**
 * Wire shape of POST /quotes (contract: QuoteRequest). null = the
 * chain's native asset.
 */
export class QuoteRequestDto implements QuoteRequest {
  @IsString()
  @IsNotEmpty()
  walletId!: string;

  @IsIn(CHAINS)
  chain!: ChainId;

  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @Matches(ADDRESS_PATTERN)
  assetIn!: `0x${string}` | null;

  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @Matches(ADDRESS_PATTERN)
  assetOut!: `0x${string}` | null;

  /** Raw units to sell; positive decimal integer string. */
  @IsString()
  @Matches(/^[1-9][0-9]*$/)
  amount!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  slippageBps?: number;
}
